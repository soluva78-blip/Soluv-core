import { Queue } from 'bullmq';
import { ITweet } from '../models/Tweet';
import { TweetParser } from './tweetParser';
import { config } from '../config';
import { logger } from '../lib/logger';

export class OrchestratorIntegration {
  private orchestratorQueue: Queue;

  constructor() {
    this.orchestratorQueue = new Queue(
      config.orchestrator.queueName,
      {
        connection: config.orchestrator.redisConnection
      }
    );
  }

  async sendToOrchestrator(tweet: ITweet): Promise<void> {
    try {
      const formattedPost = TweetParser.formatForOrchestrator(tweet);

      await this.orchestratorQueue.add('process-post', {
        rawPost: formattedPost
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      logger.info(`Tweet ${tweet.tweetId} sent to orchestrator`);
    } catch (error) {
      logger.error(`Error sending tweet ${tweet.tweetId} to orchestrator:`, error);
      throw error;
    }
  }

  async sendBatchToOrchestrator(tweets: ITweet[]): Promise<void> {
    const jobs = tweets.map(tweet => ({
      name: 'process-post',
      data: {
        rawPost: TweetParser.formatForOrchestrator(tweet)
      },
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential' as const,
          delay: 2000
        }
      }
    }));

    await this.orchestratorQueue.addBulk(jobs);
    logger.info(`Sent ${tweets.length} tweets to orchestrator`);
  }

  async getOrchestratorQueueStatus() {
    const waiting = await this.orchestratorQueue.getWaitingCount();
    const active = await this.orchestratorQueue.getActiveCount();
    const completed = await this.orchestratorQueue.getCompletedCount();
    const failed = await this.orchestratorQueue.getFailedCount();

    return {
      waiting,
      active,
      completed,
      failed
    };
  }

  async cleanup(): Promise<void> {
    await this.orchestratorQueue.close();
  }
}