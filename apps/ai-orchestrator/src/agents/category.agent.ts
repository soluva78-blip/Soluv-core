import { CategoriesRepository } from "@/repositories/categories.repository";
import { AgentResult, Category } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

export class CategoryAgent {
  constructor(private categoriesRepo: CategoriesRepository) {}

  async assignCategory(title: string, body: string): Promise<AgentResult> {
    const startTime = Date.now();
    const agentName = "category";

    try {
      const allCategories = await this.categoriesRepo.findAll();

      const newCategory = await this.determineCategoryName(
        title,
        body,
        allCategories
      );

      if (!newCategory?.industryName)
        throw new Error("LLM returned invalid JSON");

      const category = await this.categoriesRepo.findOrCreate(
        newCategory?.industryName,
        newCategory?.description,
        newCategory?.parentId ?? undefined
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
    allIndustries: Category[]
  ): Promise<{
    industryName: string;
    description: string;
    parentId: number | null;
  } | null> {
    const prompt = `
      You are an assistant that classifies posts into industries.

      Existing industries in the system (with IDs):
      ${allIndustries.map((c) => `- ${c.id}: ${c.name}`).join("\n")}
      
      Instructions:
      1. Read the title, body, and classification of the post.
      2. Identify the most relevant industry.
        - If the post clearly belongs to one of the existing industries, return that industry name exactly as listed.
        - If it should be a subcategory of an existing industry, return the subcategory name as "industryName" and set "parentId" to the parent industry’s ID.
      3. Always generate a clear, short description (1–2 sentences) for the industry or subcategory.
      4. Respond ONLY with valid JSON in this schema:
      {
        "industryName": "string",
        "description": "string",
        "parentId": number | null
      }
      
      Title: ${title}
      Body: ${body}
    `;

    const llmResult = await llmClient.generateCompletion(prompt, 50);

    if (!llmResult.success) {
      return null;
    }

    let parsed: {
      industryName: string;
      description: string;
      parentId: number | null;
    };

    try {
      parsed = jsonParser(llmResult.data, {
        industryName: "string",
        description: "string",
        parentId: ["number", null],
      });

      return parsed;
    } catch {
      return null;
    }
  }
}
