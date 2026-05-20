export { TrendsService } from "../trends.service";
export { TrendForecastingService } from "./trend-forecasting.service";
export { TrendVisualizationService } from "./trend-visualization.service";

import { SupabaseClient } from "@supabase/supabase-js";
import { TrendsService } from "../trends.service";
import { TrendForecastingService } from "./trend-forecasting.service";
import { TrendVisualizationService } from "./trend-visualization.service";

/**
 * Enhanced Trends Module with forecasting and visualization
 */
export class EnhancedTrendsModule {
  private trendsService: TrendsService;
  private forecastingService: TrendForecastingService;
  private visualizationService: TrendVisualizationService;

  constructor(private supabase: SupabaseClient) {
    this.trendsService = new TrendsService(supabase);
    this.forecastingService = new TrendForecastingService(supabase);
    this.visualizationService = new TrendVisualizationService();
  }

  /**
   * Run complete trend analysis with forecasting
   */
  async runCompleteTrendAnalysis(periodHours: number = 24): Promise<{
    currentTrends: any;
    forecasts: Map<number, any>;
    visualizations: any;
  }> {
    // Calculate current trends
    await this.trendsService.run(periodHours);

    // Get top trending clusters
    const topTrends = await this.trendsService.getTopTrending(20);

    // Generate forecasts for top clusters
    const clusterIds = topTrends.map(t => t.cluster_id!).filter(id => id != null);
    const forecasts = await this.forecastingService.forecastMultipleClusters(clusterIds);

    // Generate visualization data
    const visualizations = await this.visualizationService.generateDashboardData(
      topTrends,
      forecasts
    );

    return {
      currentTrends: topTrends,
      forecasts,
      visualizations,
    };
  }

  /**
   * Get trend insights for a specific cluster
   */
  async getClusterInsights(clusterId: number): Promise<{
    historical: any;
    forecast: any;
    anomalies: any;
    visualization: any;
  }> {
    // Get historical trends
    const historical = await this.supabase
      .from("trends")
      .select("*")
      .eq("cluster_id", clusterId)
      .order("period_end", { ascending: false })
      .limit(30);

    // Generate forecast
    const forecast = await this.forecastingService.forecastTrend(clusterId);

    // Detect anomalies
    const anomalies = await this.forecastingService.detectAnomalies(clusterId);

    // Generate visualization
    const visualization = this.visualizationService.generateClusterChart(
      historical.data || [],
      forecast
    );

    return {
      historical: historical.data,
      forecast,
      anomalies,
      visualization,
    };
  }

  /**
   * Get real-time trend alerts
   */
  async getTrendAlerts(): Promise<Array<{
    clusterId: number;
    alertType: "breakout" | "decline" | "anomaly" | "seasonal";
    severity: "low" | "medium" | "high";
    message: string;
    suggestedAction: string;
  }>> {
    const alerts: Array<{
      clusterId: number;
      alertType: "breakout" | "decline" | "anomaly" | "seasonal";
      severity: "low" | "medium" | "high";
      message: string;
      suggestedAction: string;
    }> = [];

    // Get recent trends
    const topTrends = await this.trendsService.getTopTrending(50);
    const clusterIds = topTrends.map(t => t.cluster_id!).filter(id => id != null);

    // Check each cluster for alert conditions
    for (const clusterId of clusterIds) {
      const forecast = await this.forecastingService.forecastTrend(clusterId, 48);

      // Breakout alert
      if (forecast.breakoutProbability > 0.8) {
        alerts.push({
          clusterId,
          alertType: "breakout",
          severity: "high",
          message: `Cluster ${clusterId} showing ${(forecast.breakoutProbability * 100).toFixed(0)}% breakout probability`,
          suggestedAction: "Monitor closely and prepare content amplification strategy",
        });
      }

      // Decline alert
      if (forecast.metrics.trend === "falling" && forecast.metrics.momentum < -0.5) {
        alerts.push({
          clusterId,
          alertType: "decline",
          severity: "medium",
          message: `Cluster ${clusterId} experiencing rapid decline (${(forecast.metrics.momentum * 100).toFixed(0)}% momentum)`,
          suggestedAction: "Review content strategy and engagement tactics",
        });
      }

      // Anomaly detection
      const anomalyResult = await this.forecastingService.detectAnomalies(clusterId);
      const highAnomalies = anomalyResult.anomalies.filter(a => a.severity === "high");
      if (highAnomalies.length > 0) {
        alerts.push({
          clusterId,
          alertType: "anomaly",
          severity: "high",
          message: `Cluster ${clusterId} has ${highAnomalies.length} high-severity anomalies`,
          suggestedAction: "Investigate unusual activity patterns",
        });
      }

      // Seasonal alert
      if (forecast.metrics.seasonality) {
        alerts.push({
          clusterId,
          alertType: "seasonal",
          severity: "low",
          message: `Cluster ${clusterId} shows seasonal patterns`,
          suggestedAction: "Optimize content timing for peak engagement periods",
        });
      }
    }

    // Sort by severity
    return alerts.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate trend report
   */
  async generateTrendReport(): Promise<{
    summary: string;
    topClusters: any[];
    alerts: any[];
    forecasts: any[];
    recommendations: string[];
  }> {
    const topTrends = await this.trendsService.getTopTrending(10);
    const alerts = await this.getTrendAlerts();
    const clusterIds = topTrends.map(t => t.cluster_id!).filter(id => id != null);
    const forecasts = await this.forecastingService.forecastMultipleClusters(clusterIds, 168);

    // Generate recommendations
    const recommendations: string[] = [];
    let risingCount = 0;
    let fallingCount = 0;
    let volatileCount = 0;

    forecasts.forEach(forecast => {
      if (forecast.metrics.trend === "rising") risingCount++;
      else if (forecast.metrics.trend === "falling") fallingCount++;
      else if (forecast.metrics.trend === "volatile") volatileCount++;
    });

    if (risingCount > forecasts.size * 0.5) {
      recommendations.push("🚀 Majority of clusters showing growth - scale content production");
    }
    if (fallingCount > forecasts.size * 0.3) {
      recommendations.push("📉 Multiple clusters declining - diversify content strategy");
    }
    if (volatileCount > forecasts.size * 0.4) {
      recommendations.push("⚡ High volatility detected - increase monitoring frequency");
    }

    const highPriorityAlerts = alerts.filter(a => a.severity === "high");
    if (highPriorityAlerts.length > 0) {
      recommendations.push(`🚨 ${highPriorityAlerts.length} high-priority alerts require immediate attention`);
    }

    const summary = `
Trend Analysis Summary:
- Top ${topTrends.length} clusters analyzed
- ${alerts.length} active alerts (${highPriorityAlerts.length} high priority)
- ${risingCount} rising, ${fallingCount} falling, ${volatileCount} volatile trends
- Average forecast confidence: ${Array.from(forecasts.values())
  .reduce((sum, f) => sum + f.metrics.confidence, 0) / forecasts.size * 100}%
    `.trim();

    return {
      summary,
      topClusters: topTrends.slice(0, 5),
      alerts: alerts.slice(0, 10),
      forecasts: Array.from(forecasts.entries()).map(([id, forecast]) => ({
        clusterId: id,
        trend: forecast.metrics.trend,
        momentum: forecast.metrics.momentum,
        breakoutProbability: forecast.breakoutProbability,
      })),
      recommendations,
    };
  }
}