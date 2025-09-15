import { Post } from "@/models/posts";

export class PostsRepository {
  async findUnprocessed(limit = 50) {
    return Post.find({ processed: false }).limit(limit).lean();
  }

  async markProcessed(postId: string) {
    return Post.updateOne(
      { _id: postId },
      { $set: { processed: true, processedAt: new Date() } }
    );
  }

  async deleteOldProcessed(days: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return Post.deleteMany({
      processed: true,
      processedAt: { $lt: cutoff },
    });
  }
}
