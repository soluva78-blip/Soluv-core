import { logger } from "@/lib/logger";
import { createWorker } from "@/lib/scheduler";
import { supabase } from "@/lib/supabase";
import { PostJob } from "@/queues/orchestrator.queue";
import { OrchestratorService } from "@/services/orchestrator.service";
import { Job, Worker } from "bullmq";
import "dotenv/config";
import { QueueService } from "./services/queue.service";

const orchestrator = new OrchestratorService(supabase);

export class WorkerService {
  private worker: Worker;

  constructor(private queueService: QueueService) {
    this.worker = createWorker("orchestrator", async (job: Job) => {
      const { rawPost } = job.data as PostJob;
      logger.info(`Worker picked job for post ${rawPost.id}`);

      try {
        await orchestrator.processPost(rawPost);
        logger.info(`✅ Successfully processed post ${rawPost.id}`);
      } catch (error: any) {
        logger.error(`❌ Failed to process post ${rawPost.id}:`, { error });
        throw error;
      }
    });

    this.worker.on("completed", async (job) => {
      logger.info(`✅ Job ${job.id} completed for post ${job.data.rawPost.id}`);
      await this.queueService.checkAndRefillQueue();
    });

    this.worker.on("failed", (job, err) => {
      logger.error(`❌ Job ${job?.id} failed: ${err.message}`);
    });

    this.worker.on("error", (error) => {
      logger.error("Worker error:", { error });
    });

    logger.info("🚀 Orchestrator worker running...");
  }
}
