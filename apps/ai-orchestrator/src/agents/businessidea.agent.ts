import { AgentResult } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class BusinessIdeaAgent {
  private readonly agentName = "business-idea";

  async generateIdea(title: string, body: string): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      if (!title?.trim() || !body?.trim()) {
        return this.buildResult(
          false,
          "Missing title or body content",
          null,
          startTime,
          0
        );
      }

      const prompt = `Analyze the following post and determine whether it is primarily a problem statement or a solution suggestion. 
      Then, paraphrase it into a concise business idea (1–2 lines only) that stays within the same context.
      
      Title: ${title}
      Body: ${body}
      
      Output strictly in valid JSON format:
      {
        "type": "problem" | "solution",
        "businessIdea": "string (short, 1–2 lines only, e.g. 'Build an AI-powered health app using gamification to improve fitness engagement.')"
      }
      `;
      
      const llmResult = await llmClient.generateCompletion(prompt, 200);

      if (!llmResult.success) {
        this.recordMetrics(startTime, 0, false);
        return {
          success: false,
          error: `LLM call failed: ${llmResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let parsed: { type: "problem" | "solution"; businessIdea: string };
      try {
        parsed = jsonParser(llmResult.data, {
          type: ["problem", "solution"],
          businessIdea: "string",
        });
      } catch {
        parsed = {
          type: "problem",
          businessIdea: "LLM returned invalid JSON",
        };
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
    successFlag: boolean,
    message: string,
    businessIdea: string | null,
    startTime: number,
    tokensUsed: number
  ): AgentResult {
    const latencyMs = Date.now() - startTime;
    const result: AgentResult = {
      success: true,
      data: {
        type: successFlag ? "problem" : "solution",
        businessIdea: businessIdea || message,
      },
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

export const businessIdeaAgent = new BusinessIdeaAgent();
