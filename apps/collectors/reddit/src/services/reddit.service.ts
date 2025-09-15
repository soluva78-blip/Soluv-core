import { logger } from "@/lib/logger";
import { RawRedditPost, RedditPost, RedditRssItem } from "@/types";
import { deduplicatePosts } from "@/utils/deduplication";
import { convertToRedditPost, mapSubmissionToRawPost } from "@/utils/mappers";
import Bottleneck from "bottleneck";
import Parser from "rss-parser";
import * as Snoowrap from "snoowrap";
import { ProblemKeywordFilter } from "../filters/problemKeywordFilter";

export class RedditService {
  constructor(private readonly client: Snoowrap) {}
  private parser = new Parser<object, RedditRssItem>();

  private rssLimiter = new Bottleneck({
    minTime: 5000, // 1 request every 5s
    maxConcurrent: 1,
  });

  async *fetchNewPostsStream(
    subreddit: string,
    batchSize = 50
  ): AsyncGenerator<RedditPost[]> {
    let after: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const submissions = await this.fetchNewPostsFromSubreddit(
        subreddit,
        batchSize,
        after
      );

      if (submissions.length === 0) {
        hasMore = false;
        break;
      }

      yield submissions.map(convertToRedditPost);

      after = submissions[submissions.length - 1]?.name;
    }
  }

  /**
   * Fetches and processes Reddit posts from multiple subreddits based on a search query
   * @param subreddits - Array of subreddit names to fetch posts from
   * @param query - Search query string to filter posts
   * @returns Promise resolving to an array of processed and deduplicated RedditPost objects
   */
  async run(subreddits: string[], query: string): Promise<RedditPost[]> {
    const cycle = Math.floor(Date.now() / (1000 * 60)) % 3;
    // rotates every minute: 0 = search+new, 1 = rss, 2 = search+new

    const allPostsPromises = subreddits.map(async (subreddit) => {
      logger.info(`Fetching for r/${subreddit}, cycle=${cycle}`);

      let searchPostsRaw: RawRedditPost[] = [];
      let oauthPostsRaw: RawRedditPost[] = [];
      let rssPosts: RedditPost[] = [];

      if (cycle !== 1) {
        searchPostsRaw = await this.fetchPostsBySearch(subreddit, query);
        oauthPostsRaw = await this.fetchNewPostsFromSubreddit(subreddit, 25);
      }

      if (cycle === 1) {
        rssPosts = await this.rssLimiter.schedule(() =>
          this.fetchRedditPostViaRssFeed(subreddit)
        );
      }

      const searchPosts = searchPostsRaw.map(convertToRedditPost);
      const oauthPosts = oauthPostsRaw.map(convertToRedditPost);

      const allPosts = [...searchPosts, ...oauthPosts, ...rssPosts];
      const uniquePosts = deduplicatePosts(allPosts);

      return uniquePosts;
    });

    const allPostsArrays = await Promise.all(allPostsPromises);
    return allPostsArrays.flat();
  }

  /**
   * Fetches top posts from a specific subreddit for the past day
   * @param subreddit - Name of the subreddit to fetch posts from
   * @param limit - Maximum number of posts to fetch (default: 100)
   * @returns Promise resolving to an array of raw Reddit posts
   */
  async fetchTopPostsFromSubreddit(
    subreddit: string,
    limit = 100
  ): Promise<RawRedditPost[]> {
    const submissions = await this.client
      .getSubreddit(subreddit)
      .getTop({ time: "day", limit });
    return submissions.map(mapSubmissionToRawPost);
  }

  /**
   * Fetches newest posts from a specific subreddit
   * @param subreddit - Name of the subreddit to fetch posts from
   * @param limit - Maximum number of posts to fetch (default: 100)
   * @returns Promise resolving to an array of raw Reddit posts
   */
  async fetchNewPostsFromSubreddit(
    subreddit: string,
    limit = 500,
    after?: string
  ): Promise<RawRedditPost[]> {
    const submissions = await this.client
      .getSubreddit(subreddit)
      .getNew({ limit, after });

    return submissions.map(mapSubmissionToRawPost);
  }

  /**
   * Fetches and processes Reddit posts from a subreddit's RSS feed
   * @param subreddit - Name of the subreddit to fetch posts from
   * @returns Promise resolving to an array of processed Reddit posts with relevance scores
   */
  async fetchRedditPostViaRssFeed(subreddit: string): Promise<RedditPost[]> {
    const rssUrl = `https://www.reddit.com/r/${subreddit}/.rss`;
    const feed = await this.parser.parseURL(rssUrl);

    const posts: RedditPost[] = [];
    for (const item of feed.items || []) {
      const redditPost: RedditPost = {
        id: item.guid ?? item.link ?? "",
        title: item.title ?? "",
        body: item.contentSnippet ?? "",
        author: item.creator ?? "unknown",
        score: 0,
        numComments: 0,
        subreddit,
        permalink: item.link ?? "",
        createdUtc: Date.now() / 1000,
        url: item.link ?? "",
        isNsfw: false,
        fetchedAt: Date.now(),
        detailedPostScoreBreakdown: {
          keywordScore: 0,
          contextScore: 0,
          engagementScore: 0,
          authorityScore: 0,
          freshnessScore: 0,
          total: 0,
        },
      };

      const filter = new ProblemKeywordFilter();
      const score = filter.calculateRelevanceScore(redditPost);
      redditPost.detailedPostScoreBreakdown = score;
      redditPost.score = score.total;

      posts.push(redditPost);
    }

    return posts;
  }

  /**
   * Searches for posts in a specific subreddit based on a query string
   * @param subreddit - Name of the subreddit to search in
   * @param query - Search query string
   * @returns Promise resolving to an array of raw Reddit posts matching the search criteria
   */
  async fetchPostsBySearch(
    subreddit: string,
    query: string
  ): Promise<RawRedditPost[]> {
    const searchResults = await this.client.getSubreddit(subreddit).search({
      query,
      sort: "new",
      time: "all",
    });
    // @ts-expect-error: type mismatch workaround
    return searchResults.map((post) => post);
  }
}
