import { TweetV2, UserV2 } from 'twitter-api-v2';
import { ITweet } from '../models/Tweet';

export class TweetParser {
  static parseTweet(
    tweet: TweetV2,
    author?: UserV2,
    searchQuery?: string
  ): Partial<ITweet> {
    return {
      tweetId: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id || '',
      authorUsername: author?.username || 'unknown',
      authorName: author?.name || 'Unknown',
      createdAt: new Date(tweet.created_at || Date.now()),
      metrics: {
        retweetCount: tweet.public_metrics?.retweet_count || 0,
        replyCount: tweet.public_metrics?.reply_count || 0,
        likeCount: tweet.public_metrics?.like_count || 0,
        quoteCount: tweet.public_metrics?.quote_count || 0,
        impressionCount: tweet.public_metrics?.impression_count
      },
      conversationId: tweet.conversation_id,
      referencedTweets: tweet.referenced_tweets?.map(ref => ({
        type: ref.type,
        id: ref.id
      })),
      entities: {
        hashtags: tweet.entities?.hashtags?.map(h => ({ tag: h.tag })),
        mentions: tweet.entities?.mentions?.map(m => ({ username: m.username })),
        urls: tweet.entities?.urls?.map(u => ({
          url: u.url,
          expanded_url: u.expanded_url || u.url
        }))
      },
      lang: tweet.lang,
      processed: false,
      fetchedAt: new Date(),
      searchQuery
    };
  }

  static formatForOrchestrator(tweet: ITweet) {
    return {
      id: tweet.tweetId,
      title: `Tweet by @${tweet.authorUsername}`,
      content: tweet.text,
      author: tweet.authorName,
      authorUsername: tweet.authorUsername,
      source: 'twitter',
      url: `https://twitter.com/${tweet.authorUsername}/status/${tweet.tweetId}`,
      created_at: tweet.createdAt.toISOString(),
      metadata: {
        metrics: tweet.metrics,
        lang: tweet.lang,
        hashtags: tweet.entities?.hashtags?.map(h => h.tag) || [],
        mentions: tweet.entities?.mentions?.map(m => m.username) || [],
        conversationId: tweet.conversationId,
        searchQuery: tweet.searchQuery
      }
    };
  }
}