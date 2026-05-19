import { JsonOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { ClusterMembership, PostForClustering } from "../types";
import { MathUtils } from "../utils/math-utils";

export class ClusterMetadataService {
  constructor(private llm: ChatOpenAI) {}

  async analyzeClusterType(posts: PostForClustering[]): Promise<{
    type: "problem" | "solution" | "mixed";
    subClusters?: { problem?: number[]; solution?: number[] };
  }> {
    const prompt = PromptTemplate.fromTemplate(
      `Analyze these posts and determine if they form a cluster of problems, solutions, or mixed content.
      
      Posts:
      {posts}
      
      Return a JSON object with:
      - type: "problem", "solution", or "mixed"
      - subClusters: (only if mixed) {{ problem: [indices], solution: [indices] }}
      
      Criteria:
      - Problem: Posts asking questions, reporting issues, seeking help
      - Solution: Posts offering tips, case studies, guides, successful approaches
      - Mixed: Contains both problems and solutions`
    );

    const parser = new JsonOutputParser();
    const chain = RunnableSequence.from([prompt, this.llm, parser] as any);

    const postsStr = posts
      .map((p, i) => `[${i}] ${p.body} (classification: ${p.classification})`)
      .join("\n");

    const result = await chain.invoke({ posts: postsStr });

    return {
      type: result.type as "problem" | "solution" | "mixed",
      subClusters: result.subClusters,
    };
  }

  async generateClusterMetadata(
    posts: PostForClustering[],
    clusterId: string
  ): Promise<{
    title: string;
    description: string;
    keywords: string[];
  }> {
    const prompt = PromptTemplate.fromTemplate(
      `Analyze this cluster of related posts and generate metadata.
      
      Posts:
      {posts}
      
      Return a JSON object with:
      - title: A concise, descriptive title for the cluster (max 10 words)
      - description: A one-sentence description of what unites these posts
      - keywords: Array of 3-5 most relevant keywords`
    );

    const parser = new JsonOutputParser();
    const chain = RunnableSequence.from([prompt, this.llm, parser] as any);

    const postsStr = posts
      .map((p) => `${p.body} (keywords: ${p.keywords.join(", ")})`)
      .join("\n---\n");

    const result = await chain.invoke({ posts: postsStr });

    return {
      title: result.title,
      description: result.description,
      keywords: result.keywords,
    };
  }
  findRepresentative(
    posts: PostForClustering[],
    clusterMembers: ClusterMembership[],
    embeddings: number[][]
  ): { idx: number; id: string } {
    if (clusterMembers.length === 0) {
      throw new Error("Cluster has no members");
    }

    if (clusterMembers.length === 1) {
      const single = clusterMembers[0];
      return { idx: single.idx, id: single.id };
    }

    // Weight embeddings by membership strength
    const weightedCentroid = MathUtils.calculateWeightedCentroid(
      clusterMembers
        .map((m) => {
          const embedding = embeddings[m.idx];
          if (!embedding) return null;
          return {
            embedding,
            weight: m.membership_strength,
          };
        })
        .filter((v): v is { embedding: number[]; weight: number } => v !== null)
    );

    // Find post closest to weighted centroid
    let minDist = Infinity;
    let repIdx = clusterMembers[0]?.idx;

    for (const member of clusterMembers) {
      const embedding = embeddings[member.idx];
      if (!embedding) continue;

      const dist = 1 - MathUtils.cosineSimilarity(embedding, weightedCentroid);
      const adjustedDist = dist / member.membership_strength ** 0.5;

      if (adjustedDist < minDist) {
        minDist = adjustedDist;
        repIdx = member.idx;
      }
    }

    const repPost = posts[repIdx];
    if (!repPost) {
      throw new Error(`Post not found for index ${repIdx}`);
    }

    return { idx: repIdx, id: repPost.id };
  }
}
