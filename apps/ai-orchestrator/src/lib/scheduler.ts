import { config } from "@/config";
import { Queue, QueueEvents, Worker } from "bullmq";
import { redisClient } from "./redis";

export const createQueue = (name: string) => {
  return new Queue(name, {
    connection: redisClient,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: config.orchestration.retryAttempts,
      backoff: {
        type: "exponential",
        delay: config.orchestration.retryDelayMs,
      },
    },
  });
};

export const createWorker = (name: string, processor: any) => {
  return new Worker(name, processor, {
    connection: redisClient,
    concurrency: config.orchestration.concurrency,
  });
};

export const createQueueEvents = (name: string) => {
  return new QueueEvents(name, { connection: redisClient });
};
