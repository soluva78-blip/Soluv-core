import { AgentResult } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class SpamAgent {
  private piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // Phone numbers
    /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, // Credit card
  ];

  private spamIndicators = [
    "click here",
    "buy now",
    "limited time",
    "act now",
    "free money",
    "guaranteed income",
    "work from home",
    "lose weight fast",
  ];

  async checkSpamAndPii(
    title: string,
    body: string,
    author: string
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const agentName = "spam";

    try {
      const content = `${title} ${body}`.toLowerCase();

      // Rule-based PII detection
      const hasPii = this.piiPatterns.some((pattern) => pattern.test(content));

      // Rule-based spam scoring
      let spamScore = 0;
      const totalIndicators = this.spamIndicators.length;

      for (const indicator of this.spamIndicators) {
        if (content.includes(indicator)) {
          spamScore += 1;
        }
      }

      const spamProbability = spamScore / totalIndicators;
      const isSpam = spamProbability > 0.3; // 30% threshold

      // LLM moderation check
      const prompt = `Analyze this content for spam and policy violations:

Title: ${title}
Body: ${body}
Author: ${author}

Check for:
1. Spam/promotional content
2. Personal information (PII)  
3. Inappropriate content
4. Policy violations

Respond in strict JSON:
{
  "isSpam": true/false,
  "hasPii": true/false,
  "notes": "short explanation"
}`;

      const llmResult = await llmClient.generateCompletion(prompt, 200);

      let llmAnalysis = { isSpam: false, hasPii: false, notes: "" };

      if (llmResult.success && llmResult.data) {
        try {
          llmAnalysis = jsonParser(llmResult.data, {
            isSpam: "boolean",
            hasPii: "boolean",
            notes: "string",
          });
        } catch {
          // fallback if LLM returns text instead of JSON
          llmAnalysis = {
            isSpam: false,
            hasPii: false,
            notes: (llmResult.data as string).trim(),
          };
        }
      }

      const result = {
        success: true,
        data: {
          isSpam: isSpam || llmAnalysis.isSpam,
          hasPii: hasPii || llmAnalysis.hasPii,
          notes:
            llmAnalysis.notes ||
            `Spam score: ${spamProbability.toFixed(2)}, PII detected: ${hasPii}`,
          spamScore: spamProbability,
        },
        tokensUsed: llmResult.tokensUsed || 0,
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
