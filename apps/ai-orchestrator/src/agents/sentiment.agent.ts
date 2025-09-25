import { AgentResult } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class SentimentAgent {
  async analyzeSentiment(title: string, body: string): Promise<AgentResult> {
    const startTime = Date.now();
    const agentName = "sentiment";

    try {
      const prompt = `Analyze the sentiment of this post. Consider tone, emotional state, urgency, and overall mood:

Title: ${title}
Body: ${body}

Important: If the sentiment appears mixed, classify it as "neutral".

Respond with JSON:
{
  "sentiment": "positive" | "neutral" | "negative",
  "score": -1.0 to 1.0,
  "confidence": 0.0 to 1.0
}
  
 `;

      const llmResult = await llmClient.generateCompletion(prompt, 150);

      if (!llmResult.success || !llmResult.data) {
        metricsCollector.recordAgentCall(
          agentName,
          Date.now() - startTime,
          0,
          false
        );
        return {
          success: false,
          error: `LLM call failed: ${llmResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let sentimentData: {
        sentiment: string;
        score: number;
        confidence: number;
      };
      try {
        sentimentData = jsonParser(llmResult.data, {
          sentiment: "string",
          score: "number",
          confidence: "number",
        });

      } catch {
        sentimentData = { sentiment: "neutral", score: 0.0, confidence: 0.5 };
      }

      const result = {
        success: true,
        data: sentimentData,
        tokensUsed: llmResult.tokensUsed,
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
