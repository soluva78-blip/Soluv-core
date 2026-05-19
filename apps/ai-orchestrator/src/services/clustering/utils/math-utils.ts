import * as math from "mathjs";
import { PostForClustering } from "../types";

export class MathUtils {
  static cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dot = math.dot(vec1, vec2) as number;
    const norm1 = math.norm(vec1) as number;
    const norm2 = math.norm(vec2) as number;
    return dot / (norm1 * norm2);
  }

  static calculateCentroid(embeddings: number[][]): number[] {
    const dim = embeddings[0].length;
    const centroid = Array(dim).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  static calculateWeightedCentroid(
    weightedEmbeddings: { embedding: number[]; weight: number }[]
  ): number[] {
    const dim = weightedEmbeddings[0].embedding.length;
    const centroid = Array(dim).fill(0);
    let totalWeight = 0;

    for (const { embedding, weight } of weightedEmbeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i] * weight;
      }
      totalWeight += weight;
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= totalWeight;
    }

    return centroid;
  }

  static createSimilarityMatrix(embeddings: number[][]): number[][] {
    const n = embeddings.length;
    const matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          matrix[i][j] = this.cosineSimilarity(embeddings[i], embeddings[j]);
        }
      }
    }

    return matrix;
  }

  static calculateClusterCohesion(
    memberIndices: number[],
    similarityMatrix: number[][]
  ): number {
    if (memberIndices.length <= 1) return 1;

    let totalSim = 0;
    let count = 0;

    for (let i = 0; i < memberIndices.length; i++) {
      for (let j = i + 1; j < memberIndices.length; j++) {
        totalSim += similarityMatrix[memberIndices[i]][memberIndices[j]];
        count++;
      }
    }

    return count > 0 ? totalSim / count : 0;
  }

  static debugSimilarities(
    similarityMatrix: number[][],
    posts: PostForClustering[]
  ): void {
    console.log("\nSample similarities:");
    for (let i = 0; i < Math.min(5, posts.length); i++) {
      for (let j = i + 1; j < Math.min(5, posts.length); j++) {
        console.log(
          `Post ${i} <-> Post ${j}: ${similarityMatrix[i][j].toFixed(3)}`
        );
      }
    }

    // Find highest similarities
    let highSims: { i: number; j: number; sim: number }[] = [];
    for (let i = 0; i < posts.length; i++) {
      for (let j = i + 1; j < posts.length; j++) {
        highSims.push({ i, j, sim: similarityMatrix[i][j] });
      }
    }
    highSims.sort((a, b) => b.sim - a.sim);

    console.log("\nTop 10 highest similarities:");
    highSims.slice(0, 10).forEach(({ i, j, sim }) => {
      console.log(
        `Post ${i} (${posts[i].keywords.slice(0, 3).join(",")}) <-> ` +
          `Post ${j} (${posts[j].keywords
            .slice(0, 3)
            .join(",")}): ${sim.toFixed(3)}`
      );
    });
  }
}
