// src/worker.ts
import "dotenv/config";
import { createWorker } from "@/lib/scheduler";
import { supabase } from "@/lib/supabase";
import { OrchestratorService } from "@/services/orchestrator.service";
import { logger } from "@/lib/logger";

const orchestrator = new OrchestratorService(supabase);

const worker = createWorker("orchestrator", async (job) => {
  const { postId } = job.data;
  logger.info(`Worker picked job for post ${postId}`);

  await orchestrator.processPost(postId);
});

// Handle worker lifecycle / errors
worker.on("completed", (job) => {
  logger.info(`✅ Job ${job.id} completed for post ${job.data.postId}`);
});

worker.on("failed", (job, err) => {
  logger.error(`❌ Job ${job?.id} failed: ${err.message}`);
});

logger.info("🚀 Orchestrator worker running...");
