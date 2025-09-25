import { AgentResult } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class ClassificationAgent {
  private readonly agentName = "classification";

  private readonly classifications = [
    "bug",
    "feature_request",
    "question",
    "discussion",
    "documentation",
    "other",
  ] as const;

  async classifyPost(title: string, body: string): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const prompt = `Classify this post into one of these categories: ${this.classifications.join(
        ", "
      )}
      
Title: ${title}
Body: ${body}

Consider:
- Bug: Reports of software defects, errors, or malfunctions
- Feature Request: Suggestions for new functionality or improvements
- Question: Seeking information, help, or clarification
- Discussion: General conversation, opinions, or debate
- Documentation: Requests for or contributions to documentation
- Other: Content that doesn't fit the above categories

Respond strictly in valid JSON format:
{"classification": "category", "confidence": 0.0-1.0}`;

      const llmResult = await llmClient.generateCompletion(prompt, 150);

      if (!llmResult.success) {
        this.recordMetrics(startTime, 0, false);
        return {
          success: false,
          error: `LLM call failed: ${llmResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let parsed: { classification: string; confidence: number };
      try {
        parsed = jsonParser(llmResult.data, {
          classification: "string",
          confidence: "number",
        });
      } catch {
        parsed = { classification: "other", confidence: 0.0 };
      }

      const result: AgentResult = {
        success: true,
        data: parsed,
        tokensUsed: llmResult.tokensUsed,
        latencyMs: Date.now() - startTime,
      };

      this.recordMetrics(result.latencyMs!, result.tokensUsed || 0, true);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.recordMetrics(latencyMs, 0, false);

      return {
        success: false,
        error: (error as Error).message,
        latencyMs,
      };
    }
  }

  private recordMetrics(
    latencyMs: number,
    tokensUsed: number,
    success: boolean
  ) {
    metricsCollector.recordAgentCall(
      this.agentName,
      latencyMs,
      tokensUsed,
      success
    );
  }
}

export const classificationAgent = new ClassificationAgent();
