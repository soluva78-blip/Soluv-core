import { logger } from "@/lib/logger";
import { redisClient } from "@/lib/redisClient";
import { PostsRepository } from "@/repositories/posts";
import { Job, Worker } from "bullmq";
import { QueueService } from "./queue.service";

export class WorkerService {
  private worker: Worker;
  private postsRepo = new PostsRepository();

  constructor(
    private queueService: QueueService,
    concurrency = 5
  ) {
    this.worker = new Worker(
      "posts",
      async (job: Job) => {
        try {
          logger.info(`Processed Job - ${job.data}`);

          await this.postsRepo.markProcessed(job.data._id);
        } catch (err) {
          logger.error(`❌ Job ${job.id} failed`, {
            error: err as any,
          });
          throw err;
        }
      },
      { connection: redisClient, concurrency }
    );

    this.worker.on("completed", async (job) => {
      logger.info(`✅ Job ${job.id} completed`);
      await this.queueService.checkAndRefillQueue();
    });

    this.worker.on("failed", (job, err) => {
      logger.error(`❌ Job ${job?.id} failed:`, {
        error: err.message,
      });
    });
  }
}
