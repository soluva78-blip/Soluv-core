import { OpenAIEmbeddings } from "@langchain/openai";
import { config } from "../config/env.js";

export class EmbeddingsService {
  private embeddingsModel: OpenAIEmbeddings;

  constructor() {
    this.embeddingsModel = new OpenAIEmbeddings({
      modelName: config.openai.embeddingModel,
      openAIApiKey: config.openai.apiKey,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingsModel.embedQuery(text);
  }

  calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same length");
    }

    const dotProduct = a.reduce(
      (sum, ai, i) => sum + (ai ?? 0) * (b[i] ?? 0),
      0
    );
    const normA = Math.sqrt(a.reduce((sum, ai) => sum + (ai ?? 0) ** 2, 0));
    const normB = Math.sqrt(b.reduce((sum, bi) => sum + (bi ?? 0) ** 2, 0));

    return normA && normB ? dotProduct / (normA * normB) : 0;
  }

  calculateCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];

    const dimensions = embeddings[0]?.length;
    const result = Array(dimensions).fill(0);

    embeddings.forEach((emb) =>
      emb.forEach((val, i) => {
        result[i] += val ?? 0;
      })
    );

    return result.map((sum) => sum / embeddings.length);
  }

  updateCentroidIncremental(
    currentCentroid: number[],
    currentCount: number,
    newEmbedding: number[]
  ): number[] {
    const newCount = currentCount + 1;

    return currentCentroid.map(
      (val, i) =>
        ((val ?? 0) * currentCount + (newEmbedding[i] ?? 0)) / newCount
    );
  }
}

export const embeddingsService = new EmbeddingsService();
