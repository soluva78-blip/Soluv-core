import { TwitterApi, TwitterApiReadOnly } from 'twitter-api-v2';
import { config } from '../config';
import { logger } from './logger';

class TwitterClient {
  private client: TwitterApiReadOnly;

  constructor() {
    const twitterClient = new TwitterApi({
      appKey: config.twitter.apiKey,
      appSecret: config.twitter.apiSecret,
      accessToken: config.twitter.accessToken,
      accessSecret: config.twitter.accessTokenSecret,
    });

    this.client = twitterClient.readOnly;
  }

  async searchTweets(query: string, maxResults: number = 100) {
    try {
      const tweets = await this.client.v2.search(query, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': [
          'id',
          'text',
          'author_id',
          'created_at',
          'public_metrics',
          'conversation_id',
          'referenced_tweets',
          'entities',
          'lang'
        ],
        'user.fields': ['id', 'name', 'username', 'verified', 'public_metrics'],
        'expansions': ['author_id', 'referenced_tweets.id']
      });

      return tweets;
    } catch (error) {
      logger.error('Twitter search error:', error);
      throw error;
    }
  }

  async getUserTimeline(userId: string, maxResults: number = 100) {
    try {
      const tweets = await this.client.v2.userTimeline(userId, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': [
          'id',
          'text',
          'created_at',
          'public_metrics',
          'conversation_id',
          'referenced_tweets'
        ]
      });

      return tweets;
    } catch (error) {
      logger.error('Twitter timeline error:', error);
      throw error;
    }
  }

  async getTweet(tweetId: string) {
    try {
      const tweet = await this.client.v2.singleTweet(tweetId, {
        'tweet.fields': [
          'id',
          'text',
          'author_id',
          'created_at',
          'public_metrics',
          'conversation_id',
          'referenced_tweets',
          'entities'
        ],
        'user.fields': ['id', 'name', 'username'],
        'expansions': ['author_id']
      });

      return tweet;
    } catch (error) {
      logger.error('Twitter get tweet error:', error);
      throw error;
    }
  }
}

export const twitterClient = new TwitterClient();