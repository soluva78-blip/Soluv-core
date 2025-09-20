import { config } from "@/config";
import { AgentResult } from "@/types";
import { ChatOpenAI } from "@langchain/openai";
import Tiktoken from "tiktoken";

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  async waitForTokens(count: number): Promise<void> {
    this.refill();

    while (this.tokens < count) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.refill();
    }

    this.tokens -= count;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

const tokenBucket = new TokenBucket(
  config.limits.maxTokensPerMinute,
  config.limits.maxTokensPerMinute / 60
);

const requestBucket = new TokenBucket(
  config.limits.maxRequestsPerMinute,
  config.limits.maxRequestsPerMinute / 60
);

export async function callLLMWithRetry(
  func: () => Promise<any>,
  estimatedTokens: number = 1000
): Promise<any> {
  await requestBucket.waitForTokens(1);
  await tokenBucket.waitForTokens(estimatedTokens);

  let lastError: Error | null = null;

  for (
    let attempt = 0;
    attempt < config.orchestration.retryAttempts;
    attempt++
  ) {
    try {
      return await func();
    } catch (error: any) {
      lastError = error;
      console.error(`LLM call failed (attempt ${attempt + 1}):`, error.message);

      // Exponential backoff
      const delay = config.orchestration.retryDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Placeholder for LangChain integration
export async function createLLMChain(prompt: string): Promise<any> {
  const model = new ChatOpenAI({
    modelName: config.openai.model,
    openAIApiKey: config.openai.apiKey,
    temperature: 0,
  });

  const chain = {
    invoke: async (input: any) => {
      try {
        const response = await model.invoke(
          prompt + "\n\nInput: " + JSON.stringify(input)
        );
        return {
          text: response.content,
        };
      } catch (error) {
        console.error("Error in LLM chain:", error);
        throw error;
      }
    },
  };

  return chain;
}

interface RateLimiter {
  tokens: number;
  requests: number;
  windowStart: number;
}

class LLMClient {
  private llm: ChatOpenAI;
  private rateLimiter: RateLimiter = {
    tokens: 0,
    requests: 0,
    windowStart: Date.now(),
  };

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: config.openai.apiKey,
      modelName: config.openai.model,
      temperature: 0.1,
      maxTokens: 512,
    });
  }

  private async checkRateLimit(
    estimatedTokens: number = 1000
  ): Promise<boolean> {
    const now = Date.now();
    const windowDuration = 60 * 1000; // 1 minute

    if (now - this.rateLimiter.windowStart > windowDuration) {
      this.rateLimiter.tokens = 0;
      this.rateLimiter.requests = 0;
      this.rateLimiter.windowStart = now;
    }

    if (
      this.rateLimiter.tokens + estimatedTokens >
      config.limits.maxTokensPerMinute
    ) {
      return false;
    }
    if (this.rateLimiter.requests >= config.limits.maxRequestsPerMinute) {
      return false;
    }

    return true;
  }

  private updateRateLimit(tokensUsed: number): void {
    this.rateLimiter.tokens += tokensUsed;
    this.rateLimiter.requests += 1;
  }

  async callWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = config.orchestration.retryAttempts,
    delay: number = config.orchestration.retryDelayMs
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!(await this.checkRateLimit())) {
          await this.sleep(delay);
          continue;
        }

        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries) break;

        const backoffDelay = delay * Math.pow(2, attempt - 1);
        await this.sleep(backoffDelay);
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generateCompletion(
    prompt: string,
    maxTokens: number = 150
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const result = await this.callWithRetry(async () => {
        return this.llm.invoke(prompt);
      });

      const responseText = result?.content?.toString?.() ?? "";
      const encoder = Tiktoken.encoding_for_model(config.openai.model);
      const tokens = encoder.encode(responseText);
      const tokensUsed = tokens.length;

      this.updateRateLimit(tokensUsed);

      return {
        success: true,
        data: responseText,
        tokensUsed: tokensUsed,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        latencyMs: Date.now() - startTime,
      };
    }
  }
}

export const llmClient = new LLMClient();
