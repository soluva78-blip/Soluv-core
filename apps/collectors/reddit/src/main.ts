import { redisClient } from "@/lib/redisClient";
import { convertToSoluvaPost } from "@/utils/mappers";
import Bottleneck from "bottleneck";
import { Job } from "bullmq";
import { redditClient } from "./lib/redditClient";
import { Post } from "./models/posts";
import { RedditService } from "./services/reddit.service";
import { RedditPost } from "./types";

// ----------------------------------
// 1. Throughput tracking setup
// ----------------------------------
const THROUGHPUT_KEY = "posts:fetched:current_minute";

setInterval(async () => {
  const count = parseInt((await redisClient.get(THROUGHPUT_KEY)) || "0", 10);
  console.log(`📊 Posts fetched in last 60s: ${count}`);
  await redisClient.set(THROUGHPUT_KEY, 0);
}, 60_000);

const LAST_FETCH_KEY = (subreddit: string) => `last_fetch:${subreddit}`;

async function filterNewPosts(
  subreddit: string,
  posts: RedditPost[]
): Promise<RedditPost[]> {
  const lastFetched = parseInt(
    (await redisClient.get(LAST_FETCH_KEY(subreddit))) || "0",
    10
  );

  const newOnes = posts.filter((p) => p.createdUtc > lastFetched);

  if (newOnes.length > 0) {
    const latest = Math.max(...newOnes.map((p) => p.createdUtc));
    await redisClient.set(LAST_FETCH_KEY(subreddit), latest);
  }

  return newOnes;
}

const limiter = new Bottleneck({
  reservoir: 600,
  reservoirRefreshAmount: 600,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 10,
  minTime: 50,
});

const redditService = new RedditService(redditClient);

const main = async (job: Job) => {
  const { subreddit, query } = job.data as {
    subreddit: string;
    query: string;
  };

  return limiter.schedule(async () => {
    const posts = await redditService.run([subreddit], query);

    const freshPosts = await filterNewPosts(subreddit, posts);

    await redisClient.incrby(THROUGHPUT_KEY, posts.length);

    const newPosts = freshPosts.map(convertToSoluvaPost);

    const seenKey = "seen_posts";

    // Only keep unseen posts
    const unseenPosts = [];
    for (const post of newPosts) {
      const isNew = await redisClient.sadd(seenKey, post?.id!);
      if (isNew) unseenPosts.push(post);
    }

    for (let i = 0; i < unseenPosts.length; i += 50) {
      await Post.insertMany(unseenPosts.slice(i, i + 50), { ordered: false });
    }

    return { subreddit, fetched: posts.length, stored: unseenPosts.length };
  });
};

const streamNewPosts = async (job: Job) => {
  const { subreddit } = job.data as { subreddit: string; query: string };

  return limiter.schedule(async () => {
    let storedTotal = 0;
    let fetchedTotal = 0;

    for await (const batch of redditService.fetchNewPostsStream(
      subreddit,
      50
    )) {
      fetchedTotal += batch.length;

      const freshPosts = await filterNewPosts(subreddit, batch);
      const newPosts = freshPosts.map(convertToSoluvaPost);

      const seenKey = "seen_posts";
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

export { main, streamNewPosts };
