import { SupabaseClient } from "@/lib/supabase";
import { config } from "../config/env";
import { ClustersRepository } from "../repositories/clusters.repository";
import { PostsRepository } from "../repositories/posts.repository";
import { embeddingsService } from "../utils/embeddings";

export class ClusteringService {
  private clustersRepo: ClustersRepository;
  private postsRepo: PostsRepository;

  constructor(supabase: SupabaseClient) {
    this.clustersRepo = new ClustersRepository(supabase);
    this.postsRepo = new PostsRepository(supabase);
  }

  /** ----------------- Centroid Recalculation ----------------- */

  async recomputeAllCentroids(): Promise<void> {
    console.log("[Clustering] Starting cluster centroid recomputation...");
    const clusters = await this.clustersRepo.findAll();

    for (const cluster of clusters) {
      await this.recomputeClusterCentroid(cluster.id);
    }

    console.log(
      `[Clustering] Completed recomputation for ${clusters.length} clusters`
    );
  }

  async recomputeClusterCentroid(clusterId: number): Promise<void> {
    const posts = await this.postsRepo.findMany(
      { cluster_id: clusterId, status: "processed" },
      ["id", "embedding"]
    );

    if (posts.length === 0) {
      console.log(`[Clustering] No posts found in cluster ${clusterId}`);
      return;
    }

    const postsWithEmbeddings = posts.filter(
      (p) => Array.isArray(p.embedding) && p.embedding.length > 0
    );

    if (postsWithEmbeddings.length === 0) {
      console.log(`[Clustering] No valid embeddings in cluster ${clusterId}`);
      return;
    }

    const embeddings = postsWithEmbeddings.map(
      (p) => p.embedding as unknown as number[]
    );
    const newCentroid = embeddingsService.calculateCentroid(embeddings);

    await this.clustersRepo.updateCentroid(
      clusterId,
      newCentroid,
      postsWithEmbeddings.length
    );

    console.log(
      `[Clustering] Updated centroid for cluster ${clusterId} with ${postsWithEmbeddings.length} posts`
    );
  }

  /** ----------------- Outlier Reassignment ----------------- */

  async reassignOutliers(): Promise<void> {
    console.log("[Clustering] Reassigning outlier posts...");
    const posts = await this.postsRepo.findMany(
      { status: "processed" },
      ["id", "embedding", "cluster_id"],
      config.orchestration.centroidUpdateBatchSize
    );

    let reassignedCount = 0;

    for (const post of posts) {
      if (!post.embedding || !post.cluster_id) continue;

      const bestCluster = await this.clustersRepo.findNearestCluster(
        post.embedding as unknown as number[],
        config.orchestration.clusterSimilarityThreshold
      );

      if (bestCluster && bestCluster.id !== post.cluster_id) {
        await this.postsRepo.updateCluster(post.id, bestCluster.id);
        await this.clustersRepo.incrementMemberCount(bestCluster.id);
        reassignedCount++;
      }
    }

    console.log(
      `[Clustering] Reassigned ${reassignedCount} posts to better clusters`
    );
  }

  /** ----------------- Cluster Merging ----------------- */

  async mergeSimilarClusters(
    similarityThreshold: number = 0.95
  ): Promise<void> {
    console.log("[Clustering] Merging similar clusters...");
    const clusters = await this.clustersRepo.findAll();
    const merged = new Set<number>();

    for (let i = 0; i < clusters.length; i++) {
      const selectedCluster = clusters[i];

      if (!selectedCluster) continue;

      if (merged.has(selectedCluster.id)) continue;

      for (let j = i + 1; j < clusters.length; j++) {
        const secondCluster = clusters[j];

        if (!secondCluster) continue;

        if (merged.has(secondCluster.id)) continue;

        const sim = embeddingsService.calculateCosineSimilarity(
          selectedCluster.centroid,
          secondCluster.centroid
        );

        if (sim > similarityThreshold) {
          await this.mergeClusters(selectedCluster.id, secondCluster.id);
          merged.add(secondCluster.id);
          break;
        }
      }
    }

    console.log(
      `[Clustering] Finished merging, ${merged.size} clusters merged`
    );
  }

  private async mergeClusters(
    keepClusterId: number,
    mergeClusterId: number
  ): Promise<void> {
    const postsToMove = await this.postsRepo.findMany(
      { cluster_id: mergeClusterId },
      ["id"]
    );

    for (const post of postsToMove) {
      await this.postsRepo.updateCluster(post.id, keepClusterId);
    }

    await this.recomputeClusterCentroid(keepClusterId);

    console.log(
      `[Clustering] Merged cluster ${mergeClusterId} into ${keepClusterId} (${postsToMove.length} posts moved)`
    );
  }
}
