import { CategoriesRepository } from "@/repositories/categories.repository";
import { AgentResult } from "@/types";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class CategoryAgent {
  constructor(private categoriesRepo: CategoriesRepository) {}

  async assignCategory(
    title: string,
    body: string,
    classification: string
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const agentName = "category";

    try {
      const categoryName = await this.determineCategoryName(
        title,
        body,
        classification
      );

      const category = await this.categoriesRepo.findOrCreate(
        categoryName,
        `Auto-generated category for ${classification} posts`
      );

      const result = {
        success: true,
        data: {
          categoryId: category.id,
          categoryName: category.name,
        },
        latencyMs: Date.now() - startTime,
      };

      metricsCollector.recordAgentCall(agentName, result.latencyMs!, 0, true);
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

  private async determineCategoryName(
    title: string,
    body: string,
    classification: string
  ): Promise<string> {
    const prompt = `You are a categorization system for industries.
Classify this post into an industry domain such as:
- FinTech
- HealthTech
- RetailTech
- EdTech
- PropTech
- GovTech
- ClimateTech
- Cybersecurity
- AI/ML
- Other (if nothing matches)

Title: ${title}
Body: ${body}
Classification: ${classification}

Respond with only the industry name.`;

    const llmResult = await llmClient.generateCompletion(prompt, 50);

    if (llmResult.success && llmResult.data) {
      return (llmResult.data as string).trim().replace(/['"]/g, "");
    }

    return "Other";
  }
}
