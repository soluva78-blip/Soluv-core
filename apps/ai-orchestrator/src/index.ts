#!/usr/bin/env node

import { logger } from "@/lib/logger";
import "dotenv/config";
import { connectMongoDB } from "./config/database";
import { Post } from "./models/posts";
import { QueueService } from "./services/queue.service";
import { WorkerService } from "./worker";

const queueService = new QueueService();
new WorkerService(queueService);

queueService.setBatchRefillCallback(async () => {
  return Post.find({ processed: false }).limit(50).lean();
});

async function bootstrap() {
  logger.info("🚀 Queue service starting...");
  await connectMongoDB();
  await queueService.checkAndRefillQueue();
}

async function main() {
  await bootstrap();

  logger.info("Starting orchestrator in server mode...");
  require("./server");
}

// Handle uncaught exceptions
process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason:, ${reason}`);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", {
    error,
  });
  process.exit(1);
});

if (require.main === module) {
  main().catch((error) => {
    console.log({ error });
    logger.error("Failed to start orchestrator:", { error });
    process.exit(1);
  });
}
