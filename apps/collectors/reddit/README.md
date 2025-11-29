# Reddit Collector Pipeline Documentation

## Overview

- Purpose: Continuously ingest Reddit posts from configured subreddits using OAuth (Snoowrap) and RSS, score and deduplicate them, and store normalized documents in MongoDB.
- Core components: Scheduler (cron + BullMQ), Worker, Job processors, RedditService, Redis clients/keys, Mongo models, Rate limiting via Bottleneck.
- Design goals: Maximize throughput under API limits, avoid duplicate processing across runs, support restart-safe watermarking.

## Architecture

- Queue: BullMQ backed by Redis (`fetch-subreddit` queue).
- Scheduler: cron shuffles subreddits and enqueues small randomized batches.
- Worker: consumes queue jobs, runs continuous streaming fetch per subreddit.
- RedditService: provides search/new/RSS fetches, pagination and optimized concurrent runner.
- Persistence: MongoDB with `Post` model; Redis with seen sets and per-subreddit watermark keys.

## Runtime Flow

1. Scheduler enqueues jobs every minute for 20 randomized subreddits.
2. Worker receives a job `{ subreddit, query }` and runs the continuous streaming processor bounded by a time budget.
3. Processor fetches batches (OAuth + RSS), filters by watermark, dedups by ID, maps to SoluvaPost, and stores in Mongo.
4. After each stored batch, the watermark is updated to the newest `createdUtc` to prevent reprocessing.

### Scheduler (Queue + Cron)

```ts
// src/index.ts
export const fetchWorker = new Worker(config.queue.name, streamNewPosts, {
  connection: redisClient,
});

cron.schedule("*/1 * * * *", async () => {
  const shuffled = shuffle(config.redditFetchConfig.subreddits as string[]);
  const batch = shuffled.slice(0, 20);
  for (const subreddit of batch) {
    await scheduleSubredditFetch(subreddit, "problem");
  }
});
```

### Worker Job Processor (Continuous Streaming)

```ts
// src/main.ts
const streamNewPosts = async (job: Job) => {
  const { subreddit } = job.data as { subreddit: string; query: string };
  return limiter.schedule(async () => {
    let storedTotal = 0;
    let fetchedTotal = 0;

    const lastFetched = parseInt(
      (await redisClient.get(LAST_FETCH_KEY(subreddit))) || "0",
      10
    );

    for await (const batch of redditService.fetchNewPostsStreamContinuous(
      subreddit,
      50,
      60_000,
      1_000,
      lastFetched
    )) {
      fetchedTotal += batch.length;
      const freshPosts = await filterNewPosts(subreddit, batch);
      const newPosts = freshPosts.map(convertToSoluvaPost);
      const seenKey = `seen_posts:${subreddit}`;
      const unseenPosts = [];
      for (const post of newPosts) {
        const isNew = await redisClient.sadd(seenKey, post?.id!);
        if (isNew) unseenPosts.push(post);
      }
      if (unseenPosts.length > 0) {
        await Post.insertMany(unseenPosts, { ordered: false });
        storedTotal += unseenPosts.length;
      }
    }
    await redisClient.incrby(THROUGHPUT_KEY, fetchedTotal);
    return { subreddit, fetched: fetchedTotal, stored: storedTotal };
  });
};
```

### RedditService (Continuous Stream)

```ts
// src/services/reddit.service.ts
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
      if (submissions.length === 0) { hasMore = false; break; }
      const lastCreated = submissions[submissions.length - 1]?.created_utc;
      if (lastFetchedThreshold && lastCreated && lastCreated <= lastFetchedThreshold) {
        hasMore = false;
      }
      yield submissions.map(convertToRedditPost);
      after = submissions[submissions.length - 1]?.name;
    }
    if (Date.now() < end) { await this.delay(pollIntervalMs); }
  }
}
```

### Optimized Concurrency (Multi-Source)

```ts
// src/services/reddit.service.ts
async optimizedRun(props: { subreddits: string[]; query?: string; options?: {
  perSubredditLimit?: number; pageSize?: number; timeBudgetMs?: number; concurrency?: number; } }): Promise<RedditPost[]> {
  const { subreddits, options, query } = props;
  const perSubredditLimit = options?.perSubredditLimit ?? 2000;
  const pageSize = options?.pageSize ?? 100;
  const timeBudgetMs = options?.timeBudgetMs ?? 60000;
  const concurrency = options?.concurrency ?? 20;
  this.apiLimiter.updateSettings({ maxConcurrent: concurrency });
  const start = Date.now();
  const tasks = subreddits.map((subreddit) => this.apiLimiter.schedule(async () => {
    const results: RedditPost[] = [];
    const searchPromise = query ? this.fetchPostsBySearch(subreddit, query).then(r => r.map(convertToRedditPost)) : Promise.resolve([]);
    const rssPromise = this.rssLimiter.schedule(() => this.fetchRedditPostViaRssFeed(subreddit));
    const pagedPromise = this.apiLimiter.schedule(async () => {
      const collected: RedditPost[] = []; let after: string | undefined;
      while (Date.now() - start < timeBudgetMs && collected.length < perSubredditLimit) {
        const batch = await this.client.getSubreddit(subreddit).getNew({ limit: pageSize, after });
        const mapped = batch.map(mapSubmissionToRawPost);
        if (mapped.length === 0) break;
        collected.push(...mapped.map(convertToRedditPost));
        after = mapped[mapped.length - 1]?.name;
      }
      return collected;
    });
    const settled = await Promise.allSettled([searchPromise, rssPromise, pagedPromise]);
    for (const s of settled) { if (s.status === "fulfilled") results.push(...s.value); }
    return deduplicatePosts(results);
  }));
  const arrays = await Promise.all(tasks);
  return arrays.flat();
}
```

## Deduplication & Watermarking

- Redis keys:
  - `last_fetch:<subreddit>`: stores latest `createdUtc` processed; used to filter new posts and stop deep pagination.
  - `seen_posts:<subreddit>`: Redis set of post IDs to prevent storing duplicates across runs.
- Filtering:
  - `filterNewPosts` compares `createdUtc` to watermark and updates it when new posts arrive.
  - Evidence: `src/main.ts:23-40`.

```ts
// src/main.ts
async function filterNewPosts(subreddit: string, posts: RedditPost[]): Promise<RedditPost[]> {
  const lastFetched = parseInt((await redisClient.get(LAST_FETCH_KEY(subreddit))) || "0", 10);
  const newOnes = posts.filter((p) => p.createdUtc > lastFetched);
  if (newOnes.length > 0) {
    const latest = Math.max(...newOnes.map((p) => p.createdUtc));
    await redisClient.set(LAST_FETCH_KEY(subreddit), latest);
  }
  return newOnes;
}
```

## Rate Limiting

- Bottleneck limiters:
  - OAuth limiter: `reservoir=600/min`, `maxConcurrent≈10–20`, `minTime=50–100ms`.
  - RSS limiter: `minTime=5000ms`, `maxConcurrent=1`.
- Snoowrap client also has `requestDelay` configured.

## Data Model

```ts
// src/models/posts.ts
export const Post = model<IPost>("Post", new Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  author: { type: String, required: true },
  score: { type: Number, default: 0 },
  url: { type: String, required: true },
  metadata: { type: metadataSchema, required: true },
}, { timestamps: true }), "posts");
```

## Configuration

- Required env vars: `NODE_ENV`, `MONGO_URI`, `REDIS_HOST`, `REDIS_PORT`, `REDDIT_USER_AGENT`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`, `REDDIT_SUBREDDITS`.
- Optional: `REDDIT_MIN_SCORE`, `REDDIT_FETCH_LIMIT`, `REDDIT_SORT`, `REDDIT_TIMEFRAME`, etc. See `src/config/env.ts`.

## Running & Benchmarks

- Dev: `npm run dev`
- Build: `npm run build` then `npm run start`
- Benchmark test: `npx jest src/tests/performance/benchmark.test.ts --detectOpenHandles`
- Sample output:

```
| approach | posts | ms | posts/ms |
|---|---:|---:|---:|
| baseline | 250 | 8535 | 0.029 |
| optimized | 4863 | 104667 | 0.046 |
```

## Tuning

- Adjust `concurrency`, `pageSize`, `timeBudgetMs`, and per-subreddit caps in `optimizedRun` options to target specific throughput.
- Use more subreddits and ensure they are active to increase aggregate volume.
