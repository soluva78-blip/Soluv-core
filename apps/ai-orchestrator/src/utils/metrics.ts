interface Metrics {
  postsProcessed: number;
  errors: number;
  totalLatency: number;
  totalTokensUsed: number;
  agentMetrics: Map<
    string,
    {
      calls: number;
      errors: number;
      totalLatency: number;
      totalTokens: number;
    }
  >;
}

class MetricsCollector {
  private metrics: Metrics = {
    postsProcessed: 0,
    errors: 0,
    totalLatency: 0,
    totalTokensUsed: 0,
    agentMetrics: new Map(),
  };

  recordPostProcessed(latencyMs: number): void {
    this.metrics.postsProcessed++;
    this.metrics.totalLatency += latencyMs;
  }

  recordError(): void {
    this.metrics.errors++;
  }

  recordAgentCall(
    agentName: string,
    latencyMs: number,
    tokensUsed: number = 0,
    success: boolean = true
  ): void {
    if (!this.metrics.agentMetrics.has(agentName)) {
      this.metrics.agentMetrics.set(agentName, {
        calls: 0,
        errors: 0,
        totalLatency: 0,
        totalTokens: 0,
      });
    }

    const agentMetric = this.metrics.agentMetrics.get(agentName)!;
    agentMetric.calls++;
    agentMetric.totalLatency += latencyMs;
    agentMetric.totalTokens += tokensUsed;

    if (!success) {
      agentMetric.errors++;
    }

    this.metrics.totalTokensUsed += tokensUsed;
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      postsProcessed: 0,
      errors: 0,
      totalLatency: 0,
      totalTokensUsed: 0,
      agentMetrics: new Map(),
    };
  }

  getAverageLatency(): number {
    return this.metrics.postsProcessed > 0
      ? this.metrics.totalLatency / this.metrics.postsProcessed
      : 0;
  }

  getErrorRate(): number {
    const totalAttempts = this.metrics.postsProcessed + this.metrics.errors;
    return totalAttempts > 0 ? this.metrics.errors / totalAttempts : 0;
  }
}

export const metricsCollector = new MetricsCollector();
