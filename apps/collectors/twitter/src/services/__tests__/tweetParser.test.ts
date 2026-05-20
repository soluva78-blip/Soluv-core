import { TweetV2, UserV2 } from 'twitter-api-v2';
import { TweetParser } from '../tweetParser';

describe('TweetParser', () => {
  describe('parseTweet', () => {
    it('should parse a basic tweet correctly', () => {
      const mockTweet: Partial<TweetV2> = {
        id: '123456789',
        text: 'This is a test tweet',
        author_id: '987654321',
        created_at: '2024-01-01T00:00:00.000Z',
        public_metrics: {
          retweet_count: 10,
          reply_count: 5,
          like_count: 20,
          quote_count: 2,
        },
      };

      const mockAuthor: Partial<UserV2> = {
        id: '987654321',
        username: 'testuser',
        name: 'Test User',
      };

      const result = TweetParser.parseTweet(
        mockTweet as TweetV2,
        mockAuthor as UserV2,
        'test query'
      );

      expect(result.tweetId).toBe('123456789');
      expect(result.text).toBe('This is a test tweet');
      expect(result.authorUsername).toBe('testuser');
      expect(result.authorName).toBe('Test User');
      expect(result.metrics?.retweetCount).toBe(10);
      expect(result.metrics?.likeCount).toBe(20);
      expect(result.searchQuery).toBe('test query');
    });

    it('should handle missing author gracefully', () => {
      const mockTweet: Partial<TweetV2> = {
        id: '123456789',
        text: 'Tweet without author',
        created_at: '2024-01-01T00:00:00.000Z',
      };

      const result = TweetParser.parseTweet(
        mockTweet as TweetV2,
        undefined,
        'test query'
      );

      expect(result.authorUsername).toBe('unknown');
      expect(result.authorName).toBe('Unknown');
    });

    it('should parse entities correctly', () => {
      const mockTweet: Partial<TweetV2> = {
        id: '123456789',
        text: 'Check out #startup ideas from @entrepreneur',
        entities: {
          hashtags: [{ start: 10, end: 18, tag: 'startup' }],
          mentions: [{ start: 30, end: 43, username: 'entrepreneur' }],
          urls: [{
            start: 45,
            end: 65,
            url: 'https://t.co/abc',
            expanded_url: 'https://example.com/article',
          }],
        },
      };

      const result = TweetParser.parseTweet(mockTweet as TweetV2);

      expect(result.entities?.hashtags).toEqual([{ tag: 'startup' }]);
      expect(result.entities?.mentions).toEqual([{ username: 'entrepreneur' }]);
      expect(result.entities?.urls?.[0]).toEqual({
        url: 'https://t.co/abc',
        expanded_url: 'https://example.com/article',
      });
    });
  });

  describe('formatForOrchestrator', () => {
    it('should format tweet for orchestrator correctly', () => {
      const mockTweet: any = {
        tweetId: '123456789',
        text: 'Test tweet content',
        authorUsername: 'testuser',
        authorName: 'Test User',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        metrics: {
          retweetCount: 10,
          replyCount: 5,
          likeCount: 20,
          quoteCount: 2,
        },
        entities: {
          hashtags: [{ tag: 'startup' }],
          mentions: [{ username: 'entrepreneur' }],
        },
        lang: 'en',
        searchQuery: 'test query',
      };

      const result = TweetParser.formatForOrchestrator(mockTweet);

      expect(result.id).toBe('123456789');
      expect(result.title).toBe('Tweet by @testuser');
      expect(result.content).toBe('Test tweet content');
      expect(result.source).toBe('twitter');
      expect(result.url).toBe('https://twitter.com/testuser/status/123456789');
      expect(result.metadata.hashtags).toEqual(['startup']);
      expect(result.metadata.mentions).toEqual(['entrepreneur']);
    });
  });
});