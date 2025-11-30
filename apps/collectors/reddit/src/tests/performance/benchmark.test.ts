import { redisClient } from "@/lib/redisClient";
import { OptimizedRedditCollector } from "@/optimizedJob";
import { RedditService } from "@/services/reddit.service";
import { convertToRedditPost } from "@/utils/mappers";
import Bottleneck from "bottleneck";
import Snoowrap = require("snoowrap");

jest.setTimeout(120000);

function hasCreds(): boolean {
  return Boolean(
    process.env.REDDIT_CLIENT_ID &&
      process.env.REDDIT_CLIENT_SECRET &&
      process.env.REDDIT_USERNAME &&
      process.env.REDDIT_PASSWORD &&
      process.env.REDDIT_SUBREDDITS
  );
}

async function naiveBaseline(
  service: any,
  subreddits: string[],
  query: string
) {
  const start = Date.now();
  let total = 0;
  for (const subreddit of subreddits) {
    try {
      const raw = await service.fetchNewPostsFromSubreddit(subreddit, 25);
      const posts = raw.map(convertToRedditPost);
      total += posts.length;
    } catch (e) {
      console.warn(
        `Skipping subreddit ${subreddit}: ${(e as any)?.message || e}`
      );
    }
  }
  const duration = Date.now() - start;
  return { total, duration };
}

async function optimized(service: any, subreddits: string[], query: string) {
  const start = Date.now();
  const posts = await service.optimizedRun({
    subreddits,
    query,
    options: {
      perSubredditLimit: 5000,
      pageSize: 100,
      timeBudgetMs: 60000,
      concurrency: 50,
    },
  });
  const duration = Date.now() - start;
  return { total: posts.length, duration };
}

async function altOptimizedCollector(subreddits: string[]) {
  const start = Date.now();
  const collector = new OptimizedRedditCollector({
    subreddits,
    targetPostsPerRun: 10000,
    maxConcurrency: 50,
    redisClient,
  } as any);
  const posts = await collector.collectUniquePosts();
  const duration = Date.now() - start;
  return { total: posts.length, duration };
}

describe("Reddit performance benchmark", () => {
  if (!hasCreds()) {
    it.skip("skips benchmark without Reddit credentials", () => {});
    return;
  }

  let service: any;
  let subs: string[];

  async function filterAccessibleSubs(client: Snoowrap, list: string[]) {
    const sample = list.length > 20 ? list.slice(0, 20) : list;
    const limiter = new Bottleneck({
      reservoir: 120,
      reservoirRefreshAmount: 120,
      reservoirRefreshInterval: 60 * 1000,
      maxConcurrent: 8,
      minTime: 150,
    });
    const checks = sample.map((s) =>
      limiter.schedule(async () => {
        try {
          await client.getSubreddit(s).getNew({ limit: 1 });
          return s;
        } catch {
          return null;
        }
      })
    );
    const results = await Promise.all(checks);
    return results.filter((x): x is string => Boolean(x)).slice(0, 10);
  }

  beforeAll(async () => {
    const client = new Snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT as string,
      clientId: process.env.REDDIT_CLIENT_ID as string,
      clientSecret: process.env.REDDIT_CLIENT_SECRET as string,
      username: process.env.REDDIT_USERNAME as string,
      password: process.env.REDDIT_PASSWORD as string,
    });
    client.config({ requestDelay: 100 });
    service = new RedditService(client as any);
    const rawSubs = (process.env.REDDIT_SUBREDDITS || "")
      .split(",")
      .filter(Boolean);
    subs = await filterAccessibleSubs(client as any, rawSubs);
  });

  it("compares baseline vs optimized", async () => {
    const query = "problem";

    const base = await naiveBaseline(service, subs, query);
    const opt = await optimized(service, subs, query);
    const alt = await altOptimizedCollector(subs);

    const rows = [
      {
        approach: "baseline",
        posts: base.total,
        ms: base.duration,
        rate: (base.total / Math.max(1, base.duration)).toFixed(3),
      },
      {
        approach: "optimized",
        posts: opt.total,
        ms: opt.duration,
        rate: (opt.total / Math.max(1, opt.duration)).toFixed(3),
      },
      {
        approach: "optimized-collector",
        posts: alt.total,
        ms: alt.duration,
        rate: (alt.total / Math.max(1, alt.duration)).toFixed(3),
      },
    ];

    const header = `\n| approach | posts | ms | posts/ms | latency_ms |`;
    const sep = `|---|---:|---:|---:|---:|`;
    const lines = rows.map(
      (r) => `| ${r.approach} | ${r.posts} | ${r.ms} | ${r.rate} |`
    );
    // eslint-disable-next-line no-console
    console.log([header, sep, ...lines].join("\n"));

    expect(opt.total).toBeGreaterThanOrEqual(base.total);
  });
});
