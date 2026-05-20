import { SupabaseClient } from "@supabase/supabase-js";
import { Trend } from "@/types";

interface ForecastPoint {
  timestamp: Date;
  value: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

interface TrendForecast {
  clusterId: number;
  forecastPeriod: {
    start: Date;
    end: Date;
  };
  predictions: ForecastPoint[];
  metrics: {
    trend: "rising" | "falling" | "stable" | "volatile";
    momentum: number;
    volatility: number;
    seasonality: boolean;
    confidence: number;
  };
  breakoutProbability: number;
  suggestedActions: string[];
}

interface SeasonalPattern {
  period: number; // hours
  amplitude: number;
  phase: number;
  strength: number;
}

export class TrendForecastingService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Forecast future trends for a cluster using multiple algorithms
   */
  async forecastTrend(
    clusterId: number,
    forecastHours: number = 168 // default 7 days
  ): Promise<TrendForecast> {
    // Load historical data
    const historicalData = await this.loadHistoricalData(clusterId);

    if (historicalData.length < 3) {
      return this.createSimpleForecast(clusterId, forecastHours, historicalData);
    }

    // Detect patterns
    const seasonalPattern = this.detectSeasonality(historicalData);
    const trendComponent = this.extractTrendComponent(historicalData);
    const volatility = this.calculateVolatility(historicalData);

    // Generate forecasts using multiple methods
    const arima = this.arimaForecast(historicalData, forecastHours);
    const exponentialSmoothing = this.exponentialSmoothingForecast(
      historicalData,
      forecastHours,
      seasonalPattern
    );
    const prophet = this.prophetLikeForecast(
      historicalData,
      forecastHours,
      seasonalPattern,
      trendComponent
    );

    // Ensemble prediction
    const ensemble = this.ensembleForecast([arima, exponentialSmoothing, prophet]);

    // Calculate breakout probability
    const breakoutProbability = this.calculateBreakoutProbability(
      historicalData,
      ensemble,
      volatility
    );

    // Determine trend direction and momentum
    const metrics = this.analyzeMetrics(historicalData, ensemble, volatility, seasonalPattern);

    // Generate actionable insights
    const suggestedActions = this.generateActions(metrics, breakoutProbability);

    return {
      clusterId,
      forecastPeriod: {
        start: new Date(),
        end: new Date(Date.now() + forecastHours * 60 * 60 * 1000),
      },
      predictions: ensemble,
      metrics,
      breakoutProbability,
      suggestedActions,
    };
  }

  /**
   * Load historical trend data for a cluster
   */
  private async loadHistoricalData(clusterId: number): Promise<Trend[]> {
    const { data, error } = await this.supabase
      .from("trends")
      .select("*")
      .eq("cluster_id", clusterId)
      .order("period_end", { ascending: true })
      .limit(100); // Last 100 periods

    if (error) throw error;
    return data || [];
  }

  /**
   * Detect seasonal patterns in the data
   */
  private detectSeasonality(data: Trend[]): SeasonalPattern | null {
    if (data.length < 14) return null; // Need at least 2 weeks

    const values = data.map(d => d.mention_count || 0);

    // Check for daily patterns (24h)
    const dailyPattern = this.autocorrelation(values, 24);

    // Check for weekly patterns (168h)
    const weeklyPattern = this.autocorrelation(values, 168);

    if (weeklyPattern.correlation > 0.5) {
      return {
        period: 168,
        amplitude: weeklyPattern.amplitude,
        phase: weeklyPattern.phase,
        strength: weeklyPattern.correlation,
      };
    } else if (dailyPattern.correlation > 0.5) {
      return {
        period: 24,
        amplitude: dailyPattern.amplitude,
        phase: dailyPattern.phase,
        strength: dailyPattern.correlation,
      };
    }

    return null;
  }

  /**
   * Calculate autocorrelation for seasonality detection
   */
  private autocorrelation(
    values: number[],
    lag: number
  ): { correlation: number; amplitude: number; phase: number } {
    if (values.length <= lag) {
      return { correlation: 0, amplitude: 0, phase: 0 };
    }

    const n = values.length - lag;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;

    for (let i = 0; i < n; i++) {
      const x1 = values[i] - mean;
      const x2 = values[i + lag] - mean;
      numerator += x1 * x2;
      denominator1 += x1 * x1;
      denominator2 += x2 * x2;
    }

    const correlation = numerator / Math.sqrt(denominator1 * denominator2);
    const amplitude = Math.sqrt(denominator1 / n);
    const phase = Math.atan2(numerator, denominator1);

    return { correlation, amplitude, phase };
  }

  /**
   * Extract the underlying trend component
   */
  private extractTrendComponent(data: Trend[]): {
    slope: number;
    intercept: number;
    strength: number;
  } {
    const values = data.map(d => d.mention_count || 0);
    const n = values.length;

    if (n < 2) {
      return { slope: 0, intercept: values[0] || 0, strength: 0 };
    }

    // Linear regression
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }

    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = yMean - slope * xMean;

    // Calculate R-squared
    let ssRes = 0;
    let ssTot = 0;

    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * i;
      ssRes += (values[i] - predicted) ** 2;
      ssTot += (values[i] - yMean) ** 2;
    }

    const strength = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { slope, intercept, strength };
  }

  /**
   * Calculate volatility of the time series
   */
  private calculateVolatility(data: Trend[]): number {
    const values = data.map(d => d.mention_count || 0);

    if (values.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] !== 0) {
        returns.push((values[i] - values[i - 1]) / values[i - 1]);
      }
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * ARIMA-like forecast
   */
  private arimaForecast(data: Trend[], forecastHours: number): ForecastPoint[] {
    const values = data.map(d => d.mention_count || 0);
    const predictions: ForecastPoint[] = [];

    // Simple ARIMA(1,1,1) approximation
    const alpha = 0.3; // AR coefficient
    const beta = 0.2; // MA coefficient
    const lastValue = values[values.length - 1] || 0;
    const lastDiff = values.length > 1 ? values[values.length - 1] - values[values.length - 2] : 0;

    for (let h = 1; h <= forecastHours; h++) {
      const forecastValue = lastValue + alpha * lastDiff * Math.exp(-beta * h / 24);
      const confidence = Math.max(0.3, 1 - h / (forecastHours * 2));
      const stdDev = Math.sqrt(h) * this.calculateVolatility(data) * 10;

      predictions.push({
        timestamp: new Date(Date.now() + h * 60 * 60 * 1000),
        value: Math.max(0, forecastValue),
        confidence,
        lowerBound: Math.max(0, forecastValue - 1.96 * stdDev),
        upperBound: forecastValue + 1.96 * stdDev,
      });
    }

    return predictions;
  }

  /**
   * Exponential smoothing forecast with optional seasonality
   */
  private exponentialSmoothingForecast(
    data: Trend[],
    forecastHours: number,
    seasonalPattern: SeasonalPattern | null
  ): ForecastPoint[] {
    const values = data.map(d => d.mention_count || 0);
    const predictions: ForecastPoint[] = [];

    // Holt-Winters parameters
    const alpha = 0.3; // level smoothing
    const beta = 0.1; // trend smoothing
    const gamma = seasonalPattern ? 0.2 : 0; // seasonal smoothing

    // Initialize components
    let level = values[values.length - 1] || 0;
    let trend = values.length > 1 ? (values[values.length - 1] - values[0]) / values.length : 0;
    const seasonalPeriod = seasonalPattern?.period || 24;
    const seasonal = new Array(seasonalPeriod).fill(1);

    // Build seasonal factors if pattern exists
    if (seasonalPattern && values.length >= seasonalPeriod) {
      for (let i = 0; i < seasonalPeriod; i++) {
        let sum = 0;
        let count = 0;
        for (let j = i; j < values.length; j += seasonalPeriod) {
          sum += values[j];
          count++;
        }
        seasonal[i] = count > 0 ? sum / count / level : 1;
      }
    }

    // Generate forecasts
    for (let h = 1; h <= forecastHours; h++) {
      const seasonalIndex = (h - 1) % seasonalPeriod;
      const forecastValue = (level + h * trend) * seasonal[seasonalIndex];
      const confidence = Math.max(0.4, 1 - h / (forecastHours * 1.5));
      const stdDev = Math.sqrt(h) * this.calculateVolatility(data) * 8;

      predictions.push({
        timestamp: new Date(Date.now() + h * 60 * 60 * 1000),
        value: Math.max(0, forecastValue),
        confidence,
        lowerBound: Math.max(0, forecastValue - 1.96 * stdDev),
        upperBound: forecastValue + 1.96 * stdDev,
      });
    }

    return predictions;
  }

  /**
   * Prophet-like forecast with trend and seasonality
   */
  private prophetLikeForecast(
    data: Trend[],
    forecastHours: number,
    seasonalPattern: SeasonalPattern | null,
    trendComponent: { slope: number; intercept: number; strength: number }
  ): ForecastPoint[] {
    const values = data.map(d => d.mention_count || 0);
    const predictions: ForecastPoint[] = [];
    const lastIndex = values.length - 1;

    for (let h = 1; h <= forecastHours; h++) {
      // Trend component
      const trendValue = trendComponent.intercept + trendComponent.slope * (lastIndex + h);

      // Seasonal component
      let seasonalFactor = 1;
      if (seasonalPattern) {
        const phase = (h + seasonalPattern.phase) * (2 * Math.PI) / seasonalPattern.period;
        seasonalFactor = 1 + seasonalPattern.amplitude * Math.sin(phase);
      }

      // Combine components
      const forecastValue = trendValue * seasonalFactor;
      const confidence = Math.max(0.5, trendComponent.strength * (1 - h / (forecastHours * 2)));
      const stdDev = Math.sqrt(h) * this.calculateVolatility(data) * 6;

      predictions.push({
        timestamp: new Date(Date.now() + h * 60 * 60 * 1000),
        value: Math.max(0, forecastValue),
        confidence,
        lowerBound: Math.max(0, forecastValue - 1.96 * stdDev),
        upperBound: forecastValue + 1.96 * stdDev,
      });
    }

    return predictions;
  }

  /**
   * Combine multiple forecasts into an ensemble
   */
  private ensembleForecast(forecasts: ForecastPoint[][]): ForecastPoint[] {
    if (forecasts.length === 0) return [];

    const ensemblePredictions: ForecastPoint[] = [];
    const numPoints = forecasts[0].length;

    for (let i = 0; i < numPoints; i++) {
      const points = forecasts.map(f => f[i]);
      const weights = points.map(p => p.confidence);
      const totalWeight = weights.reduce((a, b) => a + b, 0);

      if (totalWeight === 0) {
        ensemblePredictions.push(points[0]);
        continue;
      }

      // Weighted average
      const value = points.reduce((sum, p, idx) => sum + p.value * weights[idx], 0) / totalWeight;
      const lowerBound = points.reduce((sum, p, idx) => sum + p.lowerBound * weights[idx], 0) / totalWeight;
      const upperBound = points.reduce((sum, p, idx) => sum + p.upperBound * weights[idx], 0) / totalWeight;
      const confidence = points.reduce((sum, p, idx) => sum + p.confidence * weights[idx], 0) / totalWeight;

      ensemblePredictions.push({
        timestamp: points[0].timestamp,
        value,
        confidence,
        lowerBound,
        upperBound,
      });
    }

    return ensemblePredictions;
  }

  /**
   * Calculate probability of a breakout event
   */
  private calculateBreakoutProbability(
    historical: Trend[],
    forecast: ForecastPoint[],
    volatility: number
  ): number {
    if (historical.length < 10) return 0;

    const values = historical.map(d => d.mention_count || 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

    // Calculate z-score of forecast peak
    const forecastMax = Math.max(...forecast.map(f => f.value));
    const zScore = stdDev === 0 ? 0 : (forecastMax - mean) / stdDev;

    // Combine with volatility and trend strength
    const volatilityFactor = Math.min(1, volatility * 2);
    const trendFactor = forecast.length > 0 ?
      (forecast[forecast.length - 1].value - forecast[0].value) / Math.max(1, forecast[0].value) : 0;

    // Sigmoid transformation
    const rawProbability = (Math.abs(zScore) / 3 + volatilityFactor + Math.abs(trendFactor)) / 3;
    return Math.min(1, Math.max(0, rawProbability));
  }

  /**
   * Analyze forecast metrics
   */
  private analyzeMetrics(
    historical: Trend[],
    forecast: ForecastPoint[],
    volatility: number,
    seasonalPattern: SeasonalPattern | null
  ): TrendForecast["metrics"] {
    // Determine trend direction
    const firstValue = forecast[0]?.value || 0;
    const lastValue = forecast[forecast.length - 1]?.value || 0;
    const change = lastValue - firstValue;
    const changeRate = firstValue === 0 ? 0 : change / firstValue;

    let trend: "rising" | "falling" | "stable" | "volatile";
    if (volatility > 0.5) {
      trend = "volatile";
    } else if (Math.abs(changeRate) < 0.1) {
      trend = "stable";
    } else if (changeRate > 0) {
      trend = "rising";
    } else {
      trend = "falling";
    }

    // Calculate momentum
    const momentum = Math.tanh(changeRate * 2); // Normalize to [-1, 1]

    // Average confidence
    const avgConfidence = forecast.reduce((sum, f) => sum + f.confidence, 0) / forecast.length;

    return {
      trend,
      momentum,
      volatility,
      seasonality: seasonalPattern !== null,
      confidence: avgConfidence,
    };
  }

  /**
   * Generate actionable suggestions based on forecast
   */
  private generateActions(
    metrics: TrendForecast["metrics"],
    breakoutProbability: number
  ): string[] {
    const actions: string[] = [];

    if (metrics.trend === "rising" && metrics.momentum > 0.5) {
      actions.push("📈 Strong upward trend detected - increase monitoring frequency");
      actions.push("🎯 Consider amplifying successful content patterns");
    }

    if (metrics.trend === "falling" && metrics.momentum < -0.3) {
      actions.push("📉 Declining engagement - review content strategy");
      actions.push("🔄 Test new content formats or topics");
    }

    if (metrics.volatility > 0.7) {
      actions.push("⚡ High volatility - implement real-time monitoring");
      actions.push("📊 Track external factors causing fluctuations");
    }

    if (breakoutProbability > 0.7) {
      actions.push("🚀 High breakout probability - prepare scaling resources");
      actions.push("👀 Monitor for viral potential");
    }

    if (metrics.seasonality) {
      actions.push("📅 Seasonal pattern detected - plan content calendar accordingly");
      actions.push("⏰ Schedule posts for peak engagement periods");
    }

    if (metrics.confidence < 0.5) {
      actions.push("⚠️ Low forecast confidence - gather more historical data");
      actions.push("📈 Consider A/B testing to improve predictions");
    }

    return actions;
  }

  /**
   * Create simple forecast when insufficient data
   */
  private createSimpleForecast(
    clusterId: number,
    forecastHours: number,
    historicalData: Trend[]
  ): TrendForecast {
    const lastValue = historicalData[historicalData.length - 1]?.mention_count || 0;
    const predictions: ForecastPoint[] = [];

    for (let h = 1; h <= forecastHours; h++) {
      predictions.push({
        timestamp: new Date(Date.now() + h * 60 * 60 * 1000),
        value: lastValue,
        confidence: 0.3,
        lowerBound: lastValue * 0.5,
        upperBound: lastValue * 1.5,
      });
    }

    return {
      clusterId,
      forecastPeriod: {
        start: new Date(),
        end: new Date(Date.now() + forecastHours * 60 * 60 * 1000),
      },
      predictions,
      metrics: {
        trend: "stable",
        momentum: 0,
        volatility: 0,
        seasonality: false,
        confidence: 0.3,
      },
      breakoutProbability: 0,
      suggestedActions: ["📊 Insufficient data for accurate forecast - continue monitoring"],
    };
  }

  /**
   * Batch forecast for multiple clusters
   */
  async forecastMultipleClusters(
    clusterIds: number[],
    forecastHours: number = 168
  ): Promise<Map<number, TrendForecast>> {
    const forecasts = new Map<number, TrendForecast>();

    for (const clusterId of clusterIds) {
      try {
        const forecast = await this.forecastTrend(clusterId, forecastHours);
        forecasts.set(clusterId, forecast);
      } catch (error) {
        console.error(`Failed to forecast cluster ${clusterId}:`, error);
      }
    }

    return forecasts;
  }

  /**
   * Get anomaly detection for recent trends
   */
  async detectAnomalies(clusterId: number): Promise<{
    anomalies: Array<{
      timestamp: Date;
      value: number;
      expectedValue: number;
      deviation: number;
      severity: "low" | "medium" | "high";
    }>;
  }> {
    const historical = await this.loadHistoricalData(clusterId);
    const anomalies: Array<{
      timestamp: Date;
      value: number;
      expectedValue: number;
      deviation: number;
      severity: "low" | "medium" | "high";
    }> = [];

    if (historical.length < 10) return { anomalies };

    const values = historical.map(d => d.mention_count || 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

    // Use moving average for expected values
    const windowSize = Math.min(7, Math.floor(historical.length / 3));

    for (let i = windowSize; i < historical.length; i++) {
      const window = values.slice(i - windowSize, i);
      const expectedValue = window.reduce((a, b) => a + b, 0) / windowSize;
      const actualValue = values[i];
      const deviation = Math.abs(actualValue - expectedValue);
      const zScore = stdDev === 0 ? 0 : deviation / stdDev;

      if (zScore > 2) {
        let severity: "low" | "medium" | "high";
        if (zScore > 4) severity = "high";
        else if (zScore > 3) severity = "medium";
        else severity = "low";

        anomalies.push({
          timestamp: new Date(historical[i].period_end),
          value: actualValue,
          expectedValue,
          deviation,
          severity,
        });
      }
    }

    return { anomalies };
  }
}