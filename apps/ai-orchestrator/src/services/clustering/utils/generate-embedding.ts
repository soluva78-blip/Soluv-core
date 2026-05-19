import { OpenAIEmbeddings } from "@langchain/openai";
import { PostForClustering } from "../types";

export class EmbeddingService {
  constructor(
    private readonly embeddings: OpenAIEmbeddings,
    private embeddingCache: Map<string, number[]>
  ) {}

  async generateEmbeddings(posts: PostForClustering[]): Promise<number[][]> {
    const texts = posts.map((post) => {
      const keywordStr = post.keywords.join(" ");
      const categorySignal = `category_${post.category_id}`;

      const typeSignals = {
        question: "asking help problem issue struggling",
        tip: "solution solved working method approach",
        article: "guide tutorial explanation solution method",
        issue: "problem error failing broken bug",
        discussion: "debate considering thinking exploring",
      };

      const classSignal =
        typeSignals[post.classification as keyof typeof typeSignals] || "";

      return `${post.body} Keywords: ${keywordStr} Type: ${post.classification} ${classSignal} ${categorySignal}`;
    });

    console.log("Generating embeddings for", texts.length, "posts...");
    const embeddings = await this.embeddings.embedDocuments(texts);

    posts.forEach((post, i) => {
      this.embeddingCache.set(post.id, embeddings[i]);
    });

    return embeddings;
  }
}
