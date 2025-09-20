import { AgentResult } from "@/types";
import { embeddingsService } from "@/utils/embeddings";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class SemanticAgent {
  async analyzePost(title: string, body: string): Promise<AgentResult> {
    const startTime = Date.now();
    const agentName = "semantic";

    try {
      // Generate summary
      const summaryPrompt = `Summarize this post in 2-3 sentences, focusing on the core problem or question:

Title: ${title}
Body: ${body}

Summary:`;
      const summaryResult = await llmClient.generateCompletion(
        summaryPrompt,
        200
      );

      if (!summaryResult.success || !summaryResult.data) {
        metricsCollector.recordAgentCall(
          agentName,
          Date.now() - startTime,
          0,
          false
        );
        return {
          success: false,
          error: `Summary generation failed: ${summaryResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }
      const summary = (summaryResult.data as string).trim();

      // Extract keywords
      const keywordsPrompt = `Extract 5-10 key technical terms, concepts, or topics from this post:

Title: ${title}  
Body: ${body}

Return as a JSON array of strings.`;
      const keywordsResult = await llmClient.generateCompletion(
        keywordsPrompt,
        100
      );

      if (!keywordsResult.success || !keywordsResult.data) {
        metricsCollector.recordAgentCall(
          agentName,
          Date.now() - startTime,
          summaryResult.tokensUsed || 0,
          false
        );
        return {
          success: false,
          error: `Keywords extraction failed: ${keywordsResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let keywords: string[];
      try {
        keywords = JSON.parse(keywordsResult.data as string);
      } catch {
        // fallback: split by comma
        keywords = (keywordsResult.data as string)
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }

      // Generate embedding
      const contentForEmbedding = `${title} ${body}`;
      const embedding =
        await embeddingsService.generateEmbedding(contentForEmbedding);

      const totalTokensUsed =
        (summaryResult.tokensUsed || 0) + (keywordsResult.tokensUsed || 0);

      const result = {
        success: true,
        data: {
          summary,
          embedding,
          keywords,
        },
        tokensUsed: totalTokensUsed,
        latencyMs: Date.now() - startTime,
      };

      metricsCollector.recordAgentCall(
        agentName,
        result.latencyMs!,
        result.tokensUsed || 0,
        true
      );
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
}
