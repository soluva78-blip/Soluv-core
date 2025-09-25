import { CategoriesRepository } from "@/repositories/categories.repository";
import { AgentResult } from "@/types";
import { jsonParser } from "@/utils/jsonParser";
import { llmClient } from "@/utils/llm";
import { metricsCollector } from "@/utils/metrics";

/* ----------------------------- Helper types ----------------------------- */
export interface ProblemClassificationInput {
  text: string;
}

export interface DerivedProblem {
  problemStatement: string;
  label: string;
  industry: string;
  explanation: string;
}

export interface ProblemClassifierModelOutput {
  isProblem: boolean;
  explanation: string;
  label: string;
  industry: string;
  derivedProblems?: DerivedProblem[];
}

interface InitialClassificationOutput {
  isProblem: boolean;
  explanation: string;
  label: string;
  industry: string;
  potential: "none" | "existent";
}

interface ProblemDeriverOutput {
  problems: DerivedProblem[];
}

/* ------------------------------- Constants ------------------------------- */
const PREDEFINED_INDUSTRIES = [
  "FinTech",
  "HealthTech",
  "RetailTech",
  "EdTech",
  "PropTech",
  "GovTech",
  "ClimateTech",
  "Cybersecurity",
  "AI/ML",
];

/* ------------------------------ Validity Agent ---------------------------- */
export class ValidityAgent {
  private readonly agentName = "validity";

  constructor(private categoriesRepo: CategoriesRepository) {}

  public async checkValidity(
    body: string
  ): Promise<AgentResult<ProblemClassifierModelOutput>> {
    const startTime = Date.now();

    try {
      const trimmed = body?.trim() ?? "";
      if (!trimmed) {
        return this.buildSimpleResult(
          false,
          "Missing title or body content",
          startTime,
          0
        );
      }

      if (trimmed.length < 10) {
        return this.buildSimpleResult(
          false,
          "Content too short to be meaningful",
          startTime,
          0
        );
      }

      const categories = await this.categoriesRepo.findAll();
      const categoryNames =
        categories?.map((c) => c?.name).filter(Boolean) || [];

      // 1) Initial classification
      const initial = await this.performInitialClassification(
        trimmed,
        startTime,
        categoryNames
      );
      if (!initial.success || !initial.data) return initial as AgentResult<any>;

      let tokens = initial.tokensUsed ?? 0;
      let finalData: ProblemClassifierModelOutput = {
        isProblem: initial.data.isProblem,
        explanation: initial.data.explanation,
        label: initial.data.label,
        industry: initial.data.industry,
      };

      // 2) If multiple problems might exist, derive them and cross-check
      if (initial.data.potential === "existent") {
        const derived = await this.deriveProblems(trimmed, categoryNames);
        tokens += derived.tokensUsed ?? 0;

        if (derived.success && derived.data?.problems?.length) {
          const crossChecked = this.crossCheckDerivedProblems(
            derived.data.problems,
            finalData
          );
          finalData = {
            ...finalData,
            ...crossChecked,
            derivedProblems: derived.data.problems,
          };
        }
      }

      const latencyMs = Date.now() - startTime;
      this.recordMetrics(latencyMs, tokens, true);

      return {
        success: true,
        data: finalData,
        tokensUsed: tokens,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.recordMetrics(latencyMs, 0, false);

      return {
        success: false,
        error: (err as Error)?.message ?? String(err),
        latencyMs,
      };
    }
  }

  private async performInitialClassification(
    body: string,
    startTime: number,
    dbCategories: string[]
  ): Promise<AgentResult<InitialClassificationOutput>> {
    const prompt = this.buildInitialClassificationPrompt(body, dbCategories);

    const llmResult = await llmClient.generateCompletion(prompt, 200);
    if (!llmResult.success) {
      const latencyMs = Date.now() - startTime;
      this.recordMetrics(latencyMs, 0, false);
      return {
        success: false,
        error: `LLM call failed: ${llmResult.error}`,
        latencyMs,
      };
    }

    try {
      const parsed = jsonParser<InitialClassificationOutput>(llmResult.data, {
        isProblem: "boolean",
        explanation: "string",
        label: "string",
        industry: "string",
        potential: ["none", "existent"],
      });

      return {
        success: true,
        data: parsed,
        tokensUsed: llmResult.tokensUsed,
        latencyMs: Date.now() - startTime,
      };
    } catch (parseErr) {
      // Return a structured failure so callers can handle gracefully
      return {
        success: false,
        error: `Invalid JSON from LLM: ${(parseErr as Error).message}`,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  private async deriveProblems(
    body: string,
    dbCategories: string[]
  ): Promise<AgentResult<ProblemDeriverOutput>> {
    const prompt = this.buildDeriveProblemsPrompt(body, dbCategories);

    const llmResult = await llmClient.generateCompletion(prompt, 300);
    if (!llmResult.success) {
      return {
        success: false,
        error: `Problem derivation failed: ${llmResult.error}`,
        latencyMs: 0,
      };
    }

    try {
      const parsed = jsonParser<ProblemDeriverOutput>(llmResult.data, {
        problems: [
          {
            problemStatement: "string",
            label: "string",
            industry: "string",
            explanation: "string",
          },
        ],
      });

      return {
        success: true,
        data: parsed,
        tokensUsed: llmResult.tokensUsed,
        latencyMs: 0,
      };
    } catch (e) {
      return {
        success: false,
        error: "Problem deriver returned invalid JSON",
        latencyMs: 0,
      };
    }
  }

  private crossCheckDerivedProblems(
    derivedProblems: DerivedProblem[],
    original: ProblemClassifierModelOutput
  ): Partial<ProblemClassifierModelOutput> {
    if (derivedProblems.length === 0) {
      return {
        isProblem: original.isProblem,
        explanation: original.explanation,
        label: original.label,
        industry: original.industry,
      };
    }

    const primary = derivedProblems[0];

    return {
      isProblem: true,
      explanation: `Multiple problems identified. Primary: ${primary?.problemStatement}`,
      label: primary?.label,
      industry: primary?.industry,
    };
  }

  /* ---------------------------- Prompts builders --------------------------- */
  private buildInitialClassificationPrompt(
    body: string,
    dbCategories: string[]
  ) {
    const dbList = dbCategories.length ? dbCategories.join(", ") : "(none)";

    return `You are an assistant that classifies text as real-world problems.\n\nSteps:\n1. Determine if the text describes a clear, single real-world problem (true/false).\n2. Provide a brief explanation for your decision.\n3. If it is a problem, identify the industry it belongs to.\n   - If it clearly fits one of these industries, use it: ${PREDEFINED_INDUSTRIES.join(", ")}.\n   - If it matches any of my categories in the DB, use that exact category name: ${dbList}.\n   - If it does not match any of the above, infer the most relevant industry (e.g., Marketing, AgriTech, TravelTech, LegalTech, HRTech, SupplyChainTech, etc.).\n   - Always provide a specific industry. Do not return \"Other\".\n4. Determine potential for multiple problems:\n   - \"none\" if the text is clearly focused on one problem or no problems at all\n   - \"existent\" if the text contains multiple distinct problems that could be separated\n\nImportant rules:\n- Posts that are only about recruiting, pitching, sharing achievements, or asking for partners/investors are NOT valid.\n- Posts that describe frustrations, inefficiencies, or unmet needs ARE valid.\n- Posts that propose or suggest new tools, apps, or services ARE valid.\n- If text contains multiple distinct problems mixed with questions or other content, mark potential as \"existent\".\n\nRespond ONLY in valid JSON, in this format:\n{\n  \"isProblem\": true/false,\n  \"explanation\": \"brief explanation\",\n  \"label\": \"problem category (short phrase)\",\n  \"industry\": \"specific industry name (never 'Other')\",\n  \"potential\": \"none\" or \"existent\"\n}\n\nClassify this text:\n\n${body}`;
  }

  private buildDeriveProblemsPrompt(body: string, dbCategories: string[]) {
    const dbList = dbCategories.length ? dbCategories.join(", ") : "(none)";

    return `You are a problem extraction specialist. Your job is to identify and extract distinct, actionable problems from text that may contain multiple issues.\n\nGuidelines:\n1. Extract each distinct problem as a clear, standalone problem statement\n2. Focus on real-world problems, frustrations, inefficiencies, or unmet needs\n3. Ignore recruiting posts, achievement sharing, or pure networking requests\n4. For each problem, provide:\n   - A clear problem statement (1-2 sentences max)\n   - A brief label/category\n   - The most relevant industry\n   - A brief explanation of why this is a valid problem\n\nIndustries to choose from:\n- Predefined: ${PREDEFINED_INDUSTRIES.join(", ")}\n- DB Categories: ${dbList}\n- Or infer: Marketing, AgriTech, TravelTech, LegalTech, HRTech, SupplyChainTech, etc.\n\nRespond ONLY in valid JSON format:\n{\n  \"problems\": [\n    {\n      \"problemStatement\": \"clear problem description\",\n      \"label\": \"short problem category\",\n      \"industry\": \"specific industry\",\n      \"explanation\": \"why this is a valid problem\"\n    }\n  ]\n}\n\nExtract problems from this text:\n\n${body}`;
  }

  /* ---------------------------- Utilities ---------------------------- */
  private buildSimpleResult(
    isValid: boolean,
    reason: string,
    startTime: number,
    tokensUsed: number
  ): AgentResult<ProblemClassifierModelOutput> {
    const latencyMs = Date.now() - startTime;
    const result: AgentResult<ProblemClassifierModelOutput> = {
      success: true,
      data: {
        isProblem: isValid,
        explanation: reason,
        label: reason,
        industry: "General",
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
    try {
      metricsCollector.recordAgentCall(
        this.agentName,
        latencyMs,
        tokensUsed,
        success
      );
    } catch (e) {}
  }
}
