import { Worker } from "bullmq";
import * as dotenv from "dotenv";
import cron from "node-cron";
import { config } from "./config";
import connectDB from "./config/db";
import { logger } from "./lib/logger";
import { redisClient } from "./lib/redisClient";
import { scheduleSubredditFetch } from "./lib/scheduler";
import { streamNewPosts } from "./main";

dotenv.config();

export const fetchWorker = new Worker(config.queue.name, streamNewPosts, {
  connection: redisClient,
});

fetchWorker.on("ready", () => {
  logger.info("👷 Worker is connected to Redis and ready");
});

fetchWorker.on("completed", (job, result) => {
  logger.info(`✅ Job ${job.id} done:`, result);
});

fetchWorker.on("failed", (job, err) => {
  logger.error(`❌ Job ${job?.id} failed:`, {
    error: err,
  });
});

const init = async () => {
  await connectDB();

  function shuffle<T>(array: T[]): T[] {
    return array.sort(() => Math.random() - 0.5);
  }

  cron.schedule("*/1 * * * *", async () => {
    const shuffled = shuffle(config.redditFetchConfig.subreddits as string[]);
    const batch = shuffled.slice(0, 20);
    for (const subreddit of batch) {
      await scheduleSubredditFetch(subreddit, "problem");
    }
  });
};

if (process.env.NODE_ENV !== "test") {
  init();
}
