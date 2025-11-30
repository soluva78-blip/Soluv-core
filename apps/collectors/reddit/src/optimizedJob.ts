// src/services/optimized-reddit-collector.ts

import Bottleneck from "bottleneck";
import IORedis from "ioredis";
import Snoowrap, { Submission } from "snoowrap";
import { shuffle } from ".";
import { config } from "./config";
import { Post } from "./models/posts";
import { RedditPost } from "./types";
import {
  convertToRedditPost,
  convertToSoluvaPost,
  mapSubmissionToRawPost,
} from "./utils/mappers";

interface CollectorConfig {
  subreddits: string[];
  targetPostsPerRun: number;
  maxConcurrency: number;
  redisClient: IORedis;
  credentials?: Array<{
    userAgent: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  }>;
}

type TimeFilters = "hour" | "day" | "week" | "month" | "year" | "all";

/**
 * High-performance Reddit collector using multi-dimensional sampling
 *
 * Strategy:
 * 1. Sample across TIME (random time windows in past 30 days)
 * 2. Sample across SORT methods (hot, new, top, rising, controversial)
 * 3. Sample across RANDOM positions (skip to random pages)
 * 4. Use Bloom filter for ultra-fast dedup checks
 * 5. Parallel fetch with optimal rate limiting
 */
export class OptimizedRedditCollector {
  private client: Snoowrap;
  private clients: Snoowrap[] = [];
  private clientIndex = 0;
  private clientCooldownUntil: number[] = [];
  private limiter: Bottleneck;
  private redis: IORedis;
  private subreddits: string[];
  private seenSetKey = "reddit:seen_ids";

  constructor(private config: CollectorConfig) {
    const creds = this.loadCredentials();
    this.redis = config.redisClient;
    this.subreddits = config.subreddits;

    this.clients = creds.map((c) => {
      const redditInstance = new Snoowrap({
        userAgent: c.userAgent,
        clientId: c.clientId,
        clientSecret: c.clientSecret,
        username: c.username,
        password: c.password,
      });

      redditInstance.config({ requestDelay: 50 });
      return redditInstance;
    });

    this.client = this.clients[0]!;
    this.clientCooldownUntil = this.clients.map(() => 0);

    this.limiter = new Bottleneck({
      reservoir: 600,
      reservoirRefreshAmount: 600,
      reservoirRefreshInterval: 10 * 60 * 1000,
      maxConcurrent: config.maxConcurrency,
      minTime: 100,
    });
  }

  async warmRedisFromDatabase() {
    const ids = await Post.find({}, { id: 1 }).lean();
    if (!ids.length) return;

    const pipeline = this.redis.pipeline();
    for (const doc of ids) {
      pipeline.sadd(this.seenSetKey, doc.id);
    }
    await pipeline.exec();
  }

  /**
   * Main collection method - intelligently samples Reddit for unique posts
   */
  async collectUniquePosts(): Promise<RedditPost[]> {
    const startTime = Date.now();
    const targetPosts = this.config.targetPostsPerRun;

    console.log(
      `🎯 Target: ${targetPosts} unique posts from ${this.subreddits.length} subreddits`
    );

    // Generate diverse sampling strategies
    const strategies = this.generateSamplingStrategies(targetPosts);

    console.log(`📊 Generated ${strategies.length} sampling strategies`);

    // Execute all strategies in parallel with rate limiting
    const results = await Promise.allSettled(
      strategies.map((strategy) =>
        this.limiter.schedule(() => this.executeSamplingStrategy(strategy))
      )
    );

    // Collect all posts
    const allPosts: RedditPost[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allPosts.push(...result.value);
      }
    }

    try {
      console.log({ allPostsLength: allPosts.length });
      // Ultra-fast deduplication using Bloom filter + Redis set
      const uniquePosts = await this.deduplicateUltraFast(allPosts);

      console.log({ uniquePosts: uniquePosts.length });

      const duration = Date.now() - startTime;
      const rate = ((uniquePosts.length / duration) * 1000).toFixed(2);

      console.log(
        `✅ Collected ${uniquePosts.length} unique posts in ${duration}ms (${rate} posts/sec)`
      );
      console.log(
        `📈 Efficiency: ${((uniquePosts.length / allPosts.length) * 100).toFixed(1)}% unique`
      );

      return uniquePosts;
    } catch (error) {
      console.error(`❌ Failed to get unique posts:`, error);
      return [];
    }
  }

  /**
   * Generate diverse sampling strategies to maximize unique post discovery
   */
  private generateSamplingStrategiess(targetPosts: number): SamplingStrategy[] {
    const strategies: SamplingStrategy[] = [];
    const postsPerSubreddit = Math.ceil(targetPosts / this.subreddits.length);

    // Sort methods to cover all content slices
    const sortMethods: Array<
      "hot" | "new" | "top" | "rising" | "controversial"
    > = ["hot", "new", "top", "rising", "controversial"];

    for (const subreddit of this.subreddits) {
      // DIMENSION 1: Standard sort sampling
      for (const sort of sortMethods) {
        strategies.push({
          subreddit,
          sort,
          timeFilter:
            sort === "top" || sort === "controversial"
              ? this.randomTimeFilter()
              : undefined,
          limit: Math.ceil(postsPerSubreddit / sortMethods.length),
          offset: 0,
        });
      }

      // DIMENSION 2: Randomized 'new' time windows
      const timeWindows = this.generateRandomTimeWindows(5); // 5 random 2-day windows
      for (const window of timeWindows) {
        strategies.push({
          subreddit,
          sort: "new",
          limit: 25,
          offset: 0,
          before: window.before,
          after: window.after,
        });
      }

      // DIMENSION 3: Random pagination for 'hot' and 'rising'
      const baseOffsets = [50, 100, 200, 400, 600];
      for (const base of baseOffsets) {
        const offset = base + Math.floor(Math.random() * 50);
        strategies.push(
          { subreddit, sort: "hot", limit: 25, offset },
          { subreddit, sort: "rising", limit: 25, offset }
        );
      }

      // DIMENSION 4: Extra 'controversial' deep pages
      const controversialOffsets = [50, 150, 300].map(
        (base) => base + Math.floor(Math.random() * 50)
      );
      for (const offset of controversialOffsets) {
        strategies.push({
          subreddit,
          sort: "controversial",
          limit: 20,
          offset,
          timeFilter: this.randomTimeFilter(),
        });
      }
    }

    // Shuffle all strategies to spread API load
    return shuffle(strategies);
  }

  /**
   * Execute a single sampling strategy
   */
  private async executeSamplingStrategys(
    strategy: SamplingStrategy
  ): Promise<RedditPost[]> {
    const { subreddit, sort, timeFilter, limit = 25 } = strategy;

    try {
      const sub = this.client.getSubreddit(subreddit);
      let submissions: Submission[] = [];

      const options: any = { limit: Math.min(limit, 100) };

      switch (sort) {
        case "hot":
          submissions = await sub.getHot(options);
          break;
        case "new":
          submissions = await sub.getNew(options);
          break;
        case "top":
          if (timeFilter) options.time = timeFilter;
          submissions = await sub.getTop(options);
          break;
        case "rising":
          submissions = await sub.getRising(options);
          break;
        case "controversial":
          if (timeFilter) options.time = timeFilter;
          submissions = await sub.getControversial(options);
          break;
      }

      console.log({ length: submissions.length });
      const rawPosts = submissions.map(mapSubmissionToRawPost);
      return rawPosts.map(convertToRedditPost);
    } catch (error) {
      console.error(
        `❌ Strategy failed for ${subreddit} ${sort} ${timeFilter}:`,
        error
      );
      return [];
    }
  }

  private generateSamplingStrategies(targetPosts: number): SamplingStrategy[] {
    const strategies: SamplingStrategy[] = [];
    const postsPerSubreddit = Math.ceil(targetPosts / this.subreddits.length);

    // Sort methods to cover all content slices
    const sortMethods: Array<
      "hot" | "new" | "top" | "rising" | "controversial"
    > = ["hot", "new", "top", "rising", "controversial"];

    for (const subreddit of this.subreddits) {
      // DIMENSION 1: Standard sort sampling
      for (const sort of sortMethods) {
        strategies.push({
          subreddit,
          sort,
          limit: Math.min(
            Math.ceil(postsPerSubreddit / sortMethods.length),
            100
          ),
          timeFilter:
            sort === "top" || sort === "controversial"
              ? this.randomTimeFilter()
              : undefined,
        });
      }

      // DIMENSION 2: Randomized top/controversial sampling with extra time filters
      for (const sort of ["top", "controversial"] as const) {
        for (let i = 0; i < 3; i++) {
          // 3 random time filters
          strategies.push({
            subreddit,
            sort,
            limit: 25,
            timeFilter: this.randomTimeFilter(),
          });
        }
      }

      // DIMENSION 3: Extra new/hot/rising sampling
      for (const sort of ["new", "hot", "rising"] as const) {
        for (let i = 0; i < 2; i++) {
          // 2 extra random pulls
          strategies.push({
            subreddit,
            sort,
            limit: 25,
          });
        }
      }
    }

    return shuffle(strategies);
  }

  private async executeSamplingStrategy(
    strategy: SamplingStrategy
  ): Promise<RedditPost[]> {
    const { subreddit, sort, limit = 25, timeFilter } = strategy;

    try {
      const cli = await this.nextClient();
      const sub = cli.getSubreddit(subreddit);
      const options: any = { limit: Math.min(limit, 100) };

      // Only apply timeFilter for valid sorts
      if ((sort === "top" || sort === "controversial") && timeFilter) {
        options.time = timeFilter;
      }

      let submissions: Submission[] = [];
      switch (sort) {
        case "hot":
          submissions = await sub.getHot(options);
          break;
        case "new":
          submissions = await sub.getNew(options);
          break;
        case "top":
          submissions = await sub.getTop(options);
          break;
        case "rising":
          submissions = await sub.getRising(options);
          break;
        case "controversial":
          submissions = await sub.getControversial(options);
          break;
      }

      const rawPosts = submissions.map(mapSubmissionToRawPost);
      return rawPosts.map(convertToRedditPost);
    } catch (error) {
      const msg = String((error as any)?.message || "");
      if (/ratelimit/i.test(msg) || (error as any)?.statusCode === 429) {
        this.cooldownCurrent(60_000);
        for (let attempt = 0; attempt < this.clients.length - 1; attempt++) {
          try {
            const cli = await this.nextClient();
            const sub = cli.getSubreddit(subreddit);
            const options: any = { limit: Math.min(limit, 100) };
            if ((sort === "top" || sort === "controversial") && timeFilter) {
              options.time = timeFilter;
            }
            let submissions: Submission[] = [];
            switch (sort) {
              case "hot":
                submissions = await sub.getHot(options);
                break;
              case "new":
                submissions = await sub.getNew(options);
                break;
              case "top":
                submissions = await sub.getTop(options);
                break;
              case "rising":
                submissions = await sub.getRising(options);
                break;
              case "controversial":
                submissions = await sub.getControversial(options);
                break;
            }
            const rawPosts = submissions.map(mapSubmissionToRawPost);
            return rawPosts.map(convertToRedditPost);
          } catch (e2: any) {
            const m2 = String(e2?.message || "");
            if (/ratelimit/i.test(m2) || e2?.statusCode === 429) {
              this.cooldownCurrent(60_000);
              continue;
            }
            break;
          }
        }
      }
      console.error(
        `❌ Strategy failed for ${subreddit} ${sort} ${timeFilter}:`,
        error
      );
      return [];
    }
  }

  /**
   * Ultra-fast deduplication using Bloom filter + Redis set
   * Bloom filter gives O(1) probabilistic check, Redis confirms
   */
  private async deduplicateUltraFastsV3(
    posts: RedditPost[]
  ): Promise<RedditPost[]> {
    const unique: RedditPost[] = [];
    const newIds: string[] = [];

    // Batch check Redis for existing IDs
    const pipeline = this.redis.multi();
    for (const post of posts) {
      pipeline.sismember(this.seenSetKey, post.id);
    }
    const existenceResults = await pipeline.exec();

    // Filter out seen posts
    for (let i = 0; i < posts.length; i++) {
      const result = existenceResults?.[i];
      const exists = Array.isArray(result) && result[1] === 1;

      if (!exists) {
        const post = posts[i];

        if (post) unique.push(post);
        newIds.push(post?.id || "");
      }
    }

    // Batch add new IDs to Redis
    if (newIds.length > 0) {
      await this.redis.sadd(this.seenSetKey, newIds);

      // Set expiry to 90 days to keep memory bounded
      await this.redis.expire(this.seenSetKey, 90 * 24 * 60 * 60);
    }

    return unique;
  }

  private async deduplicateUltraFastsV2(
    posts: RedditPost[]
  ): Promise<RedditPost[]> {
    const unique: RedditPost[] = [];
    const newIds: string[] = [];

    const pipeline = this.redis.multi();
    for (const post of posts) {
      pipeline.sismember(this.seenSetKey, post.id);
    }

    const redisResults = (await pipeline.exec()) ?? [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]!; // <-- removes undefined error safely

      const redisEntry = redisResults[i];
      const redisSeen = Array.isArray(redisEntry) && redisEntry[1] === 1;

      if (redisSeen) continue;

      const existsInDb = await Post.exists({ id: post.id });
      if (existsInDb) {
        await this.redis.sadd(this.seenSetKey, post.id);
        continue;
      }

      unique.push(post);
      newIds.push(post.id);
    }

    if (newIds.length > 0) {
      await this.redis.sadd(this.seenSetKey, newIds);
      await this.redis.expire(this.seenSetKey, 90 * 86400);
    }

    return unique;
  }
  private async deduplicateUltraFast(
    posts: RedditPost[]
  ): Promise<RedditPost[]> {
    if (posts.length === 0) return [];

    const unique: RedditPost[] = [];
    const newIds: string[] = [];

    // Step 1: Check Redis in one multi
    const pipeline = this.redis.multi();
    for (const post of posts) {
      pipeline.sismember(this.seenSetKey, post.id);
    }
    const redisResults = (await pipeline.exec()) ?? [];

    // Step 2: Filter posts that are not in Redis
    const candidates = posts.filter((post, i) => {
      const redisEntry = redisResults[i];
      const redisSeen = Array.isArray(redisEntry) && redisEntry[1] === 1;
      return !redisSeen;
    });

    if (candidates.length === 0) return [];

    // Step 3: Check DB in one query instead of per-post
    const idsToCheck = candidates.map((p) => p.id);
    const existingInDb = new Set(
      (await Post.find({ id: { $in: idsToCheck } }, { id: 1 })).map((p) => p.id)
    );

    // Step 4: Filter posts that are not in DB
    for (const post of candidates) {
      if (!existingInDb.has(post.id)) {
        unique.push(post);
        newIds.push(post.id);
      }
    }

    // Step 5: Add new IDs to Redis
    if (newIds.length > 0) {
      await this.redis.sadd(this.seenSetKey, newIds);
      await this.redis.expire(this.seenSetKey, 90 * 86400); // 90 days
    }

    return unique;
  }

  /**
   * Generate random time windows for temporal sampling
   */
  private generateRandomTimeWindows(
    count: number
  ): Array<{ before?: number; after?: number }> {
    const windows: Array<{ before?: number; after?: number }> = [];
    const now = Date.now() / 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

    for (let i = 0; i < count; i++) {
      // Random point in last 30 days
      const randomPoint = thirtyDaysAgo + Math.random() * (now - thirtyDaysAgo);
      const windowSize = 2 * 24 * 60 * 60; // 2-day window

      windows.push({
        after: Math.floor(randomPoint - windowSize),
        before: Math.floor(randomPoint),
      });
    }

    return windows;
  }

  /**
   * Random time filter for top/controversial posts
   */
  private randomTimeFilter(): TimeFilters {
    const filters: Array<TimeFilters> = [
      "hour",
      "day",
      "week",
      "month",
      "year",
      "all",
    ];
    return filters[Math.floor(Math.random() * filters.length)] as TimeFilters;
  }

  private loadCredentials() {
    if (this.config.credentials && this.config.credentials.length > 0) {
      return this.config.credentials;
    }

    const json = process.env.REDDIT_ACCOUNTS;

    if (json) {
      try {
        const arr = JSON.parse(json);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }

    return [
      {
        userAgent: config.reddit.userAgent,
        clientId: config.reddit.clientId,
        clientSecret: config.reddit.clientSecret,
        username: config.reddit.userName,
        password: config.reddit.password,
      },
    ];
  }

  /**
   * Select the next available Reddit API client that is not on cooldown.
   *
   * The method implements round-robin selection with cooldown awareness:
   * 1. Hydrates in-memory cooldown times from Redis (`cooldown:{index}` keys).
   * 2. Iterates clients starting from the last-used index, returning the first
   *    whose cooldown timestamp is in the past.
   * 3. If every client is cooling down, the caller is blocked until the
   *    earliest cooldown expires, then the next client in sequence is chosen.
   *
   * @returns A ready-to-use Snoowrap instance.
   * @throws When no client exists at the computed index (should never occur).
   */
  private async nextClient(): Promise<Snoowrap> {
    const totalClients = this.clients.length;

    // Refresh local cooldown cache from Redis
    for (let index = 0; index < totalClients; index++) {
      const cooldownKey = `cooldown:${index}`;
      const cooldownUntilStr = await this.redis.get?.(cooldownKey);
      if (cooldownUntilStr) {
        const cooldownUntil = parseInt(cooldownUntilStr, 10);
        if (Number.isFinite(cooldownUntil)) {
          this.clientCooldownUntil[index] = cooldownUntil;
        }
      }
    }

    // Find the first client that is not cooling down
    for (let offset = 0; offset < totalClients; offset++) {
      const candidateIndex = (this.clientIndex + offset) % totalClients;
      if (Date.now() >= (this.clientCooldownUntil[candidateIndex] ?? 0)) {
        this.clientIndex = candidateIndex;
        const selectedClient = this.clients[candidateIndex];
        if (!selectedClient) {
          throw new Error(`No Reddit client at index ${candidateIndex}`);
        }
        this.client = selectedClient;
        return this.client;
      }
    }

    // All clients are cooling; wait for the earliest expiry
    const shortestWaitMs = Math.min(
      ...this.clientCooldownUntil.map((ts) => Math.max(0, ts - Date.now()))
    );
    if (shortestWaitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, shortestWaitMs));
    }

    // Advance to the next client in round-robin order
    this.clientIndex = (this.clientIndex + 1) % totalClients;
    const selectedClient = this.clients[this.clientIndex];
    if (!selectedClient) {
      throw new Error(`No Reddit client at index ${this.clientIndex}`);
    }
    this.client = selectedClient;
    return this.client;
  }

  private cooldownCurrent(ms: number) {
    const idx = this.clientIndex;
    const until = Date.now() + ms;
    this.clientCooldownUntil[idx] = until;
    const seconds = Math.ceil(ms / 1000);
    const key = `cooldown:${idx}`;
    if ((this.redis as any).set) {
      (this.redis as any).set(key, String(until));
      if ((this.redis as any).expire) (this.redis as any).expire(key, seconds);
    }
  }
}

interface SamplingStrategy {
  subreddit: string;
  sort: "hot" | "new" | "top" | "rising" | "controversial";
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number;
  offset?: number;
  before?: number;
  after?: number;
}

// ============================================
// WORKER INTEGRATION
// ============================================

export async function optimizedWorkerJob(job: any, redisClient: IORedis) {
  const subreddits = job.data.subreddits ?? [
    "AskReddit",
    "technology",
    "science",
  ];

  console.log({ subreddits });
  const collector = new OptimizedRedditCollector({
    subreddits,
    targetPostsPerRun: 5000,
    maxConcurrency: 20,
    redisClient,
  });
  await collector.warmRedisFromDatabase();

  const uniquePosts = await collector.collectUniquePosts();

  const newPosts = uniquePosts.map(convertToSoluvaPost);

  console.log({ length: newPosts.length });

  const BATCH_SIZE = 500;

  for (let i = 0; i < newPosts.length; i += BATCH_SIZE) {
    const batch = newPosts.slice(i, i + BATCH_SIZE);
    try {
      await Post.insertMany(batch, { ordered: false });
      console.log(`Inserted batch ${i / BATCH_SIZE + 1}`);
    } catch (err: any) {
      // Check if the error is a duplicate key error
      if (err.code === 11000) {
        console.log(
          `Batch ${i / BATCH_SIZE + 1} contains duplicates, skipping them.`
        );
      } else {
        console.error(`Error inserting batch ${i / BATCH_SIZE + 1}`, err);
      }
    }
  }

  return {
    collected: uniquePosts.length,
    timestamp: new Date().toISOString(),
  };
}
