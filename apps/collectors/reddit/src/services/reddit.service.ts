import { logger } from "@/lib/logger";
import { RawRedditPost, RedditPost, RedditRssItem } from "@/types";
import { deduplicatePosts } from "@/utils/deduplication";
import { convertToRedditPost, mapSubmissionToRawPost } from "@/utils/mappers";
import Bottleneck from "bottleneck";
import Parser from "rss-parser";
import * as Snoowrap from "snoowrap";
import { ProblemKeywordFilter } from "../filters/problemKeywordFilter";

interface OptimizedRunProps {
  subreddits: string[];
  query?: string;
  options?: {
    perSubredditLimit?: number;
    pageSize?: number;
    timeBudgetMs?: number;
    concurrency?: number;
  };
}
export class RedditService {
  constructor(private readonly client: Snoowrap) {}
  private parser = new Parser<object, RedditRssItem>();
  private apiLimiter = new Bottleneck({
    reservoir: 600,
    reservoirRefreshAmount: 600,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 10,
    minTime: 100,
  });

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

  async *fetchNewPostsStreamContinuous(
    subreddit: string,
    batchSize = 50,
    timeBudgetMs = 60000,
    pollIntervalMs = 1000,
    lastFetchedThreshold?: number
  ): AsyncGenerator<RedditPost[]> {
    const end = Date.now() + timeBudgetMs;
    while (Date.now() < end) {
      let after: string | undefined;
      let hasMore = true;
      while (hasMore && Date.now() < end) {
        const submissions = await this.fetchNewPostsFromSubreddit(
          subreddit,
          batchSize,
          after
        );
        if (submissions.length === 0) {
          hasMore = false;
          break;
        }
        // Early exit: if we reached older than last fetched, stop inner paging
        const lastCreated = submissions[submissions.length - 1]?.created_utc;
        if (lastFetchedThreshold && lastCreated && lastCreated <= lastFetchedThreshold) {
          hasMore = false;
        }
        yield submissions.map(convertToRedditPost);
        after = submissions[submissions.length - 1]?.name;
      }
      if (Date.now() < end) {
        await this.delay(pollIntervalMs);
      }
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

  async optimizedRun(props: OptimizedRunProps): Promise<RedditPost[]> {
    const { subreddits, options, query } = props;
    const perSubredditLimit = options?.perSubredditLimit ?? 2000;
    const pageSize = options?.pageSize ?? 100;
    const timeBudgetMs = options?.timeBudgetMs ?? 60000;
    const concurrency = options?.concurrency ?? 20;
    this.apiLimiter.updateSettings({ maxConcurrent: concurrency });

    const start = Date.now();

    const tasks = subreddits.map((subreddit) =>
      this.apiLimiter.schedule(async () => {
        try {
          const results: RedditPost[] = [];

          // Run search, RSS, and paged concurrently
          const searchPromise = query
            ? this.apiLimiter.schedule(async () => {
                const raw = await this.fetchPostsBySearch(subreddit, query);
                return raw.map(convertToRedditPost);
              })
            : Promise.resolve<RedditPost[]>([]);

          const rssPromise = this.rssLimiter.schedule(async () => {
            return await this.fetchRedditPostViaRssFeed(subreddit);
          });

          const pagedPromise = this.apiLimiter.schedule(async () => {
            const collected: RedditPost[] = [];
            let after: string | undefined;
            while (
              Date.now() - start < timeBudgetMs &&
              collected.length < perSubredditLimit
            ) {
              const batch = await this.client
                .getSubreddit(subreddit)
                .getNew({ limit: pageSize, after });
              const mapped = batch.map(mapSubmissionToRawPost);
              if (mapped.length === 0) break;
              collected.push(...mapped.map(convertToRedditPost));
              after = mapped[mapped.length - 1]?.name;
            }
            return collected;
          });

          const settled = await Promise.allSettled([
            searchPromise,
            rssPromise,
            pagedPromise,
          ]);

          for (const s of settled) {
            if (s.status === "fulfilled") results.push(...s.value);
          }

          return deduplicatePosts(results);
        } catch (err: any) {
          const msg = String(err?.message || "");
          const isRate = err?.statusCode === 429 || /rate/i.test(msg);
          if (isRate) {
            await this.delay(2000);
            const rss = await this.rssLimiter.schedule(async () => {
              return await this.fetchRedditPostViaRssFeed(subreddit);
            });
            return rss;
          }
          return [];
        }
      })
    );

    const arrays = await Promise.all(tasks);
    return arrays.flat();
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }
}
