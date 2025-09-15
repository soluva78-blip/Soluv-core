import { PostsRepository } from "@/repositories/posts";
import connectDB from "./config/db";
import { logger } from "./lib/logger";
import { QueueService } from "./services/queue.service";
import { WorkerService } from "./services/worker.service";

const queueService = new QueueService();
new WorkerService(queueService, 5);
const postsRepo = new PostsRepository();

queueService.setBatchRefillCallback(async () => {
  return postsRepo.findUnprocessed(50);
});

async function bootstrap() {
  logger.info("🚀 Queue service starting...");
  await connectDB();
  await queueService.checkAndRefillQueue();

  setInterval(
    async () => {
      await postsRepo.deleteOldProcessed(7);
    },
    60 * 60 * 1000
  );
}

bootstrap();
