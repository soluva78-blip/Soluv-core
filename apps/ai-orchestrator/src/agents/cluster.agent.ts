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
    title: string,
    body?: string
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const agentName = "cluster";

    try {
      const nearestClusters = await this.clustersRepo.findNearestCluster(
        embedding,
        config.orchestration.clusterSimilarityThreshold
      );

      const nearestCluster = nearestClusters?.[0]
      console.log("reached here", nearestCluster)

      let clusterId: number;

      if (nearestCluster) {

        clusterId = nearestCluster.id;

        const existingCentroid = typeof nearestCluster.centroid === 'string'
          ? JSON.parse(nearestCluster.centroid)
          : nearestCluster.centroid;

        const newCentroid = embeddingsService.updateCentroidIncremental(
          existingCentroid,
          nearestCluster.member_count,
          embedding
        );

        await this.clustersRepo.updateCentroid(
          clusterId,
          newCentroid,
          nearestCluster.member_count + 1
        );

        await this.clustersRepo.incrementMemberCount(clusterId);
        await this.clustersRepo.addPostToCluster(clusterId, postId);
      } else {
        console.log({title})
        const clusterName = await this.generateClusterName(title);
        const clusterType = await this.classifyClusterType(title, body);
        const clusterDescription = await this.generateClusterDescription(title, body, clusterType);

        const newCluster = await this.clustersRepo.create({
          name: clusterName,
          centroid: embedding,
          memberCount: 1,
          categoryId,
          type: clusterType,
          description: clusterDescription,
          representativePostId: postId,
          memberIds: [postId],
          metadata: {
            createdFromPost: postId,
            initialTitle: title,
          },
        });

        clusterId = newCluster.id;
      }
      console.log("got to the end");


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
    const prompt = `Generate a short descriptive cluster name (5-10 words) based on this title:
"${title}"

Use title-case and create a name that captures the core issue or theme.
Cluster name:`;

    const llmResult = await llmClient.generateCompletion(prompt, 30);

    if (llmResult.success && llmResult.data) {
      return (llmResult.data as string).trim().replace(/[^a-zA-Z0-9\s-]/g, "");
    }

    const words = title.split(" ").slice(0, 5);
    return (
      words
        .join(" ")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .trim() || "Unnamed Cluster"
    );
  }

  private async classifyClusterType(title: string, body?: string): Promise<"problem" | "solution"> {
    const content = `${title}\n${body || ""}`.trim();
    const prompt = `Classify this post as either "problem" or "solution":

Content: "${content}"

Instructions:
- "problem": If the post describes a pain point, issue, complaint, or asks for help
- "solution": If the post proposes a feature, approach, fix, or actionable idea

Classification:`;

    const llmResult = await llmClient.generateCompletion(prompt, 10);

    if (llmResult.success && llmResult.data) {
      const classification = (llmResult.data as string).toLowerCase().trim();
      if (classification.includes("solution")) {
        return "solution";
      }
    }

    return "problem"; // Default to problem
  }

  private async generateClusterDescription(
    title: string,
    body: string | undefined,
    type: "problem" | "solution"
  ): Promise<string> {
    const content = `${title}\n${body || ""}`.trim();
    const typeContext = type === "problem"
      ? "pain point or issue"
      : "proposed solution or approach";

    const prompt = `Generate a 1-2 sentence description for this ${typeContext}:

Content: "${content}"

The description should explain why this matters and its business/user impact. Keep it concise and professional.

Description:`;

    const llmResult = await llmClient.generateCompletion(prompt, 100);

    if (llmResult.success && llmResult.data) {
      return (llmResult.data as string).trim();
    }

    return `A cluster representing a ${type} related to ${title.toLowerCase()}.`;
  }
}
