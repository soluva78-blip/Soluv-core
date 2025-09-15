import { logger } from "@/lib/logger";
import { redisClient } from "@/lib/redisClient";
import { Queue } from "bullmq";

export class QueueService {
  private queue: Queue;
  private LOW_QUEUE_THRESHOLD = 3;
  private batchRefillCallback: (() => Promise<any[]>) | null = null;

  constructor() {
    this.queue = new Queue("posts", {
      connection: redisClient,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    });
  }

  setBatchRefillCallback(callback: () => Promise<any[]>) {
    this.batchRefillCallback = callback;
  }

  async addPosts(posts: any[]) {
    if (!posts.length) return [];

    const jobs = posts.map((post) => ({
      name: "process-post",
      data: post,
    }));

    const addedJobs = await this.queue.addBulk(jobs);
    return addedJobs.map((j) => j.id!);
  }

  async checkAndRefillQueue() {
    if (!this.batchRefillCallback) return;

    const [waiting, active] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
    ]);
    const totalInProgress = waiting.length + active.length;

    if (totalInProgress <= this.LOW_QUEUE_THRESHOLD) {
      logger.info(`📉 Queue low (${totalInProgress}), refilling...`);
      const newPosts = await this.batchRefillCallback();

      // Deduplicate against jobs already in queue
      const queuedIds = new Set([
        ...waiting.map((j) => j.data.id),
        ...active.map((j) => j.data.id),
      ]);

      const freshPosts = newPosts.filter((p) => !queuedIds.has(p.id));

      if (freshPosts.length > 0) {
        await this.addPosts(freshPosts);
        logger.info(`📥 Refilled with ${freshPosts.length} posts`);
      } else {
        logger.info("⚠️ No new posts available to refill");
      }
    }
  }

  async getStats() {
    const counts = await this.queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed"
    );
    return counts;
  }
}
