import { Tweet, ITweet } from '../models/Tweet';
import { twitterClient } from '../lib/twitterClient';
import { searchRateLimiter } from '../lib/rateLimiter';
import { TweetParser } from './tweetParser';
import { logger } from '../lib/logger';
import { config } from '../config';

export class TweetCollector {
  private processedTweetIds = new Set<string>();

  async collectTweetsForQuery(query: string): Promise<ITweet[]> {
    try {
      const tweets = await searchRateLimiter.schedule(async () => {
        return await twitterClient.searchTweets(query, config.twitter.maxResultsPerQuery);
      });

      const savedTweets: ITweet[] = [];
      const users = new Map(tweets.includes?.users?.map(u => [u.id, u]) || []);

      for await (const tweet of tweets) {
        if (this.processedTweetIds.has(tweet.id)) {
          continue;
        }

        try {
          const author = users.get(tweet.author_id || '');
          const parsedTweet = TweetParser.parseTweet(tweet, author, query);

          const savedTweet = await this.saveTweet(parsedTweet);
          if (savedTweet) {
            savedTweets.push(savedTweet);
            this.processedTweetIds.add(tweet.id);
          }
        } catch (error) {
          logger.error(`Error processing tweet ${tweet.id}:`, error);
        }
      }

      logger.info(`Collected ${savedTweets.length} new tweets for query: "${query}"`);
      return savedTweets;
    } catch (error) {
      logger.error(`Error collecting tweets for query "${query}":`, error);

      // Handle rate limit errors
      if (error && typeof error === 'object' && 'code' in error && error.code === 429) {
        const resetTime = 'reset' in error ? error.reset : Date.now() + 900000;
        logger.warn(`Rate limited. Waiting until ${new Date(resetTime as number).toISOString()}`);
        throw new Error('RATE_LIMITED');
      }

      throw error;
    }
  }

  async collectAllQueries(): Promise<ITweet[]> {
    const allTweets: ITweet[] = [];

    for (const query of config.twitter.searchQueries) {
      try {
        const tweets = await this.collectTweetsForQuery(query);
        allTweets.push(...tweets);

        // Add delay between queries to respect rate limits
        await this.delay(2000);
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMITED') {
          logger.warn('Rate limit hit, stopping collection for this cycle');
          break;
        }
        logger.error(`Error collecting query "${query}":`, error);
      }
    }

    return allTweets;
  }

  private async saveTweet(tweetData: Partial<ITweet>): Promise<ITweet | null> {
    try {
      const existingTweet = await Tweet.findOne({ tweetId: tweetData.tweetId });

      if (existingTweet) {
        // Update metrics if tweet already exists
        existingTweet.metrics = tweetData.metrics!;
        await existingTweet.save();
        return null; // Return null to indicate it wasn't a new tweet
      }

      const newTweet = new Tweet(tweetData);
      await newTweet.save();
      return newTweet;
    } catch (error) {
      logger.error('Error saving tweet:', error);
      return null;
    }
  }

  async getUnprocessedTweets(limit: number = 100): Promise<ITweet[]> {
    return await Tweet.find({ processed: false })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async markAsProcessed(tweetId: string): Promise<void> {
    await Tweet.updateOne(
      { tweetId },
      {
        processed: true,
        processedAt: new Date()
      }
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}