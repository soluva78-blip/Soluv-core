import { AgentResult } from "@/types";
import { ClustersRepository } from "@/repositories/clusters.repository";
import { embeddingsService } from "@/utils/embeddings";
import { metricsCollector } from "@/utils/metrics";
import { config } from "@/config";
import { llmClient } from "@/utils/llm";

export class ClusterAgent {
  constructor(private clustersRepo: ClustersRepository) {}

  async assignCluster(
    postId: string,
    embedding: number[],
    categoryId: number,
    title: string
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const agentName = "cluster";

    try {
      const nearestCluster = await this.clustersRepo.findNearestCluster(
        embedding,
        config.orchestration.clusterSimilarityThreshold
      );

      let clusterId: number;

      if (nearestCluster) {
        clusterId = nearestCluster.id;

        const newCentroid = embeddingsService.updateCentroidIncremental(
          nearestCluster.centroid,
          nearestCluster.memberCount,
          embedding
        );

        await this.clustersRepo.updateCentroid(
          clusterId,
          newCentroid,
          nearestCluster.memberCount + 1
        );

        await this.clustersRepo.incrementMemberCount(clusterId);
      } else {
        const clusterName = await this.generateClusterName(title);

        const newCluster = await this.clustersRepo.create({
          name: clusterName,
          centroid: embedding,
          memberCount: 1,
          categoryId,
          metadata: {
            createdFromPost: postId,
            initialTitle: title,
          },
        });

        clusterId = newCluster.id;
      }

      const result = {
        success: true,
        data: {
          clusterId,
          isNewCluster: !nearestCluster,
        },
        latencyMs: Date.now() - startTime,
      };

      metricsCollector.recordAgentCall(agentName, result.latencyMs!, 0, true);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      metricsCollector.recordAgentCall(agentName, latencyMs, 0, false);
      return {
        success: false,
        error: (error as Error).message,
        latencyMs,
      };
    }
  }

  private async generateClusterName(title: string): Promise<string> {
    const prompt = `Generate a short descriptive cluster name (max 3 words) based on this title:
"${title}"
Cluster name:`;

    const llmResult = await llmClient.generateCompletion(prompt, 20);

    if (llmResult.success && llmResult.data) {
      return (llmResult.data as string).trim().replace(/[^a-zA-Z0-9\s]/g, "");
    }

    const words = title.split(" ").slice(0, 3);
    return (
      words
        .join(" ")
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .trim() || "Unnamed Cluster"
    );
  }
}
