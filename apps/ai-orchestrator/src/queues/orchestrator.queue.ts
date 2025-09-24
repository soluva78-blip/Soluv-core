import { createQueue } from "@/lib/scheduler";

export const orchestratorQueue = createQueue("orchestrator");

export interface PostJob {
  postId: string;
}

export async function addPostToQueue(postId: string): Promise<void> {
  await orchestratorQueue.add("process-post", { postId });
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