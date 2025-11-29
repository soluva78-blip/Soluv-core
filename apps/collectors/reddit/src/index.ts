import { Worker } from "bullmq";
import * as dotenv from "dotenv";
import cron from "node-cron";
import { config } from "./config";
import connectDB from "./config/db";
import { optimizedWorkerJob } from "./file";
import { logger } from "./lib/logger";
import { redisClient } from "./lib/redisClient";
import { scheduleSubredditFetch } from "./lib/scheduler";

dotenv.config();

export const fetchWorker = new Worker(
  config.queue.name,
  async (job) => {
    await optimizedWorkerJob(job, redisClient);
  },
  {
    connection: redisClient,
  }
);

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

export function shuffle<T>(array: T[]): T[] {
  let i = array.length - 1;
  while (i > 0) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i]!;
    array[i] = array[j]!;
    array[j] = temp;
    i--;
  }
  return array;
}

const init = async () => {
  await connectDB();

  cron.schedule("*/1 * * * *", async () => {
    const shuffled = shuffle(config.redditFetchConfig.subreddits as string[]);
    const batch = shuffled.slice(0, 20);
    await scheduleSubredditFetch(batch, "problem");
  });
};

if (process.env.NODE_ENV !== "test") {
  init();
}
