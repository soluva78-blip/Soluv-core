import { config } from "@/config";
import { Queue } from "bullmq";
import { logger } from "./logger";
import { redisClient } from "./redisClient";

const fetchQueue = new Queue(config.queue.name, {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    removeOnFail: 500,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export async function scheduleSubredditFetch(subreddits: string[], query: string) {
  const job = await fetchQueue.add("fetch", { subreddits, query });
  logger.info(`"📥 Job added:", ${job.id}, ${subreddits}`);
}
