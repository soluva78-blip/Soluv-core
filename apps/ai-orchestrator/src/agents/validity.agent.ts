import { AgentResult } from "@/types";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class ValidityAgent {
  private readonly agentName = "validity";

  async checkValidity(title: string, body: string): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      if (!title?.trim() || !body?.trim()) {
        return this.buildResult(
          false,
          "Missing title or body content",
          startTime,
          0
        );
      }

      if (body.length < 10) {
        return this.buildResult(
          false,
          "Content too short to be meaningful",
          startTime,
          0
        );
      }

      // --- LLM-based validity check ---
      const prompt = `Analyze if this post contains a valid, actionable problem or question:
      
Title: ${title}
Body: ${body}

Respond strictly in valid JSON format:
{"isValid": boolean, "reason": "string explanation"}`;

      const llmResult = await llmClient.generateCompletion(prompt, 150);

      if (!llmResult.success) {
        this.recordMetrics(startTime, 0, false);
        return {
          success: false,
          error: `LLM call failed: ${llmResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let parsed: { isValid: boolean; reason: string };
      try {
        parsed = JSON.parse(llmResult.data as string);
      } catch {
        parsed = { isValid: false, reason: "LLM returned invalid JSON" };
      }

      const result: AgentResult = {
        success: true,
        data: parsed,
        tokensUsed: llmResult.tokensUsed,
        latencyMs: Date.now() - startTime,
      };

      this.recordMetrics(startTime, result.tokensUsed || 0, true);
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

  private buildResult(
    isValid: boolean,
    reason: string,
    startTime: number,
    tokensUsed: number
  ): AgentResult {
    const latencyMs = Date.now() - startTime;
    const result: AgentResult = {
      success: true,
      data: { isValid, reason },
      tokensUsed,
      latencyMs,
    };

    this.recordMetrics(latencyMs, tokensUsed, true);
    return result;
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

export const validityAgent = new ValidityAgent();
