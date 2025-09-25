import { createQueue } from "@/lib/scheduler";
import { RawPost } from "@/types";

export const orchestratorQueue = createQueue("orchestrator");

export interface PostJob {
  rawPost: RawPost;
}

export async function addPostToQueue(rawPost: RawPost): Promise<void> {
  await orchestratorQueue.add("process-post", { rawPost });
}

export async function getQueueStatus() {
  const waiting = await orchestratorQueue.getWaiting();
  const active = await orchestratorQueue.getActive();
  const completed = await orchestratorQueue.getCompleted();
  const failed = await orchestratorQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
  };
}