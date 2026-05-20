import { Queue, Worker } from 'bullmq';
import { redisClient } from './redisClient';
import { TweetCollector } from '../services/tweetCollector';
import { OrchestratorIntegration } from '../services/orchestratorIntegration';
import { logger } from './logger';

export const twitterQueue = new Queue('twitter-collector', {
  connection: redisClient
});

export async function scheduleTwitterFetch() {
  await twitterQueue.add(
    'fetch-tweets',
    {},
    {
      repeat: {
        every: 15 * 60 * 1000 // 15 minutes
      },
      removeOnComplete: 10,
      removeOnFail: 50
    }
  );

  logger.info('Twitter fetch scheduled');
}

export function startWorker() {
  const collector = new TweetCollector();
  const orchestrator = new OrchestratorIntegration();

  const worker = new Worker(
    'twitter-collector',
    async (job) => {
      logger.info(`Processing job ${job.id}: ${job.name}`);

      try {
        // Collect tweets from Twitter API
        const tweets = await collector.collectAllQueries();
        logger.info(`Collected ${tweets.length} new tweets`);

        // Send to orchestrator for processing
        if (tweets.length > 0) {
          await orchestrator.sendBatchToOrchestrator(tweets);

          // Mark tweets as processed
          for (const tweet of tweets) {
            await collector.markAsProcessed(tweet.tweetId);
          }
        }

        // Also process any unprocessed tweets from previous runs
        const unprocessedTweets = await collector.getUnprocessedTweets(50);
        if (unprocessedTweets.length > 0) {
          logger.info(`Processing ${unprocessedTweets.length} unprocessed tweets`);
          await orchestrator.sendBatchToOrchestrator(unprocessedTweets);

          for (const tweet of unprocessedTweets) {
            await collector.markAsProcessed(tweet.tweetId);
          }
        }

        return {
          newTweets: tweets.length,
          processedBacklog: unprocessedTweets.length
        };
      } catch (error) {
        logger.error('Worker error:', error);
        throw error;
      }
    },
    {
      connection: redisClient,
      concurrency: 1
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}