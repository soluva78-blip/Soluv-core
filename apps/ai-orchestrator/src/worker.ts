import "dotenv/config";
import { createWorker } from "@/lib/scheduler";
import { supabase } from "@/lib/supabase";
import { OrchestratorService } from "@/services/orchestrator.service";
import { logger } from "@/lib/logger";
import { PostJob } from "@/queues/orchestrator.queue";

const orchestrator = new OrchestratorService(supabase);

const worker = createWorker("orchestrator", async (job) => {
  const { postId } = job.data as PostJob;
  logger.info(`Worker picked job for post ${postId}`);

  try {
    await orchestrator.processPost(postId);
    logger.info(`✅ Successfully processed post ${postId}`);
  } catch (error) {
    logger.error(`❌ Failed to process post ${postId}:`, error);
    throw error;
  }
});

// Handle worker lifecycle / errors
worker.on("completed", (job) => {
  logger.info(`✅ Job ${job.id} completed for post ${job.data.postId}`);
});

worker.on("failed", (job, err) => {
  logger.error(`❌ Job ${job?.id} failed: ${err.message}`);
});

worker.on("error", (error) => {
  logger.error("Worker error:", error);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down worker...");
  await worker.close();
  process.exit(0);
});

logger.info("🚀 Orchestrator worker running...");