import { AgentResult } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export interface CompetitorAnalysis {
  existingSolutions: Array<{
    name: string;
    description: string;
    marketPosition: string;
  }>;
  gaps: string[];
  differentiationOpportunities: string[];
  competitiveLandscape: string;
}

export class CompetitorAgent {
  private readonly agentName = "competitor-analysis";

  async analyzeCompetitors(
    title: string,
    body: string,
    businessIdea?: string
  ): Promise<AgentResult<CompetitorAnalysis>> {
    const startTime = Date.now();

    try {
      if (!title?.trim() || !body?.trim()) {
        return this.buildErrorResult(
          "Missing title or body content",
          startTime
        );
      }

      const prompt = `Analyze the competitive landscape for the following problem and potential business idea.

${businessIdea ? `Business Idea: ${businessIdea}` : ''}

Problem Context:
Title: ${title}
Body: ${body}

Identify existing solutions in the market, gaps in current offerings, and opportunities for differentiation.

Return ONLY valid JSON in this format:
{
  "existingSolutions": [
    {
      "name": "string (competitor or solution name)",
      "description": "string (brief description)",
      "marketPosition": "string (leader/challenger/niche)"
    }
  ],
  "gaps": ["string (market gap or unmet need)"],
  "differentiationOpportunities": ["string (opportunity for competitive advantage)"],
  "competitiveLandscape": "string (overall assessment of competition intensity)"
}`;

      const llmResult = await llmClient.generateCompletion(prompt, 400);

      if (!llmResult.success) {
        this.recordMetrics(startTime, 0, false);
        return {
          success: false,
          error: `LLM call failed: ${llmResult.error}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let parsed: CompetitorAnalysis;
      try {
        parsed = jsonParser(llmResult.data, {
          existingSolutions: "array",
          gaps: "array",
          differentiationOpportunities: "array",
          competitiveLandscape: "string",
        });

        // Validate the structure
        if (!Array.isArray(parsed.existingSolutions)) {
          parsed.existingSolutions = [];
        }
        if (!Array.isArray(parsed.gaps)) {
          parsed.gaps = [];
        }
        if (!Array.isArray(parsed.differentiationOpportunities)) {
          parsed.differentiationOpportunities = [];
        }
      } catch (error) {
        return this.buildErrorResult(
          `Failed to parse LLM response: ${error}`,
          startTime
        );
      }

      const result: AgentResult<CompetitorAnalysis> = {
        success: true,
        data: parsed,
        tokensUsed: llmResult.tokensUsed,
        latencyMs: Date.now() - startTime,
      };

      this.recordMetrics(startTime, result.tokensUsed || 0, true);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.recordMetrics(startTime, 0, false);

      return {
        success: false,
        error: (error as Error).message,
        latencyMs,
      };
    }
  }

  private buildErrorResult(
    error: string,
    startTime: number
  ): AgentResult<CompetitorAnalysis> {
    const latencyMs = Date.now() - startTime;
    this.recordMetrics(startTime, 0, false);

    return {
      success: false,
      error,
      latencyMs,
    };
  }

  private recordMetrics(
    startTime: number,
    tokensUsed: number,
    success: boolean
  ) {
    const latencyMs = Date.now() - startTime;
    metricsCollector.recordAgentCall(
      this.agentName,
      latencyMs,
      tokensUsed,
      success
    );
  }
}

export const competitorAgent = new CompetitorAgent();