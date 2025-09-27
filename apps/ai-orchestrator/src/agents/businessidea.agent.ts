import { AgentResult } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class BusinessIdeaAgent {
  private readonly agentName = "business-idea";

  async generateIdea(
    title: string,
    body: string
  ): Promise<AgentResult<{ businessIdea: string }>> {
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

      const prompt = `Analyze the following user post. 
Identify the main pain point being described (not what they already did). 
Then suggest ONE concise business idea (1 line) that could help a wide group of users who face this same pain point. 

Return ONLY valid JSON in this format:
{
  "businessIdea": "string (a single one-line business idea suggestion)"
}

Title: ${title}
Body: ${body}
`;

      const llmResult = await llmClient.generateCompletion(prompt, 150);

      if (!llmResult.success) {
        this.recordMetrics(startTime, 0, false);
        return {
          success: false,
          error: `LLM call failed: ${llmResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let parsed: { businessIdea: string };
      try {
        parsed = jsonParser(llmResult.data, {
          businessIdea: "string",
        });
      } catch {
        parsed = {
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
