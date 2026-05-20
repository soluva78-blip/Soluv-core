import { Trend } from "@/types";

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    fill?: boolean;
    tension?: number;
    borderDash?: number[];
  }>;
}

interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

interface DashboardMetrics {
  totalClusters: number;
  averageTrendScore: number;
  topGrowthRate: number;
  volatilityIndex: number;
  breakoutClusters: number;
}

export class TrendVisualizationService {
  private readonly colorPalette = {
    primary: "#3B82F6",
    secondary: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#6366F1",
    success: "#22C55E",
    neutral: "#6B7280",
  };

  /**
   * Generate chart data for a single cluster
   */
  generateClusterChart(
    historical: Trend[],
    forecast?: any
  ): {
    timeSeriesChart: ChartData;
    growthChart: ChartData;
    sentimentChart: ChartData;
  } {
    // Time series chart
    const timeSeriesChart = this.createTimeSeriesChart(historical, forecast);

    // Growth rate chart
    const growthChart = this.createGrowthChart(historical);

    // Sentiment chart
    const sentimentChart = this.createSentimentChart(historical);

    return {
      timeSeriesChart,
      growthChart,
      sentimentChart,
    };
  }

  /**
   * Create time series chart with historical and forecast data
   */
  private createTimeSeriesChart(historical: Trend[], forecast?: any): ChartData {
    const historicalLabels = historical.map(h =>
      new Date(h.period_end).toLocaleDateString()
    );
    const historicalData = historical.map(h => h.mention_count || 0);

    const datasets = [
      {
        label: "Historical",
        data: historicalData,
        borderColor: this.colorPalette.primary,
        backgroundColor: `${this.colorPalette.primary}20`,
        fill: true,
        tension: 0.4,
      },
    ];

    if (forecast?.predictions) {
      const forecastLabels = forecast.predictions.map((p: any) =>
        new Date(p.timestamp).toLocaleDateString()
      );
      const forecastData = forecast.predictions.map((p: any) => p.value);
      const lowerBound = forecast.predictions.map((p: any) => p.lowerBound);
      const upperBound = forecast.predictions.map((p: any) => p.upperBound);

      datasets.push(
        {
          label: "Forecast",
          data: [...new Array(historicalData.length).fill(null), ...forecastData],
          borderColor: this.colorPalette.secondary,
          backgroundColor: `${this.colorPalette.secondary}20`,
          borderDash: [5, 5],
          fill: false,
          tension: 0.4,
        },
        {
          label: "Confidence Interval",
          data: [...new Array(historicalData.length).fill(null), ...upperBound],
          borderColor: `${this.colorPalette.secondary}40`,
          backgroundColor: `${this.colorPalette.secondary}10`,
          fill: "+1",
          tension: 0.4,
        },
        {
          label: "Lower Bound",
          data: [...new Array(historicalData.length).fill(null), ...lowerBound],
          borderColor: `${this.colorPalette.secondary}40`,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.4,
        }
      );

      return {
        labels: [...historicalLabels, ...forecastLabels],
        datasets,
      };
    }

    return {
      labels: historicalLabels,
      datasets,
    };
  }

  /**
   * Create growth rate chart
   */
  private createGrowthChart(historical: Trend[]): ChartData {
    const labels = historical.map(h =>
      new Date(h.period_end).toLocaleDateString()
    );
    const growthRates = historical.map(h => (h.growth_rate || 0) * 100);

    const colors = growthRates.map(rate =>
      rate > 0 ? this.colorPalette.success : this.colorPalette.danger
    );

    return {
      labels,
      datasets: [
        {
          label: "Growth Rate (%)",
          data: growthRates,
          backgroundColor: colors,
          borderColor: colors,
          fill: false,
        },
      ],
    };
  }

  /**
   * Create sentiment analysis chart
   */
  private createSentimentChart(historical: Trend[]): ChartData {
    const labels = historical.map(h =>
      new Date(h.period_end).toLocaleDateString()
    );
    const sentiments = historical.map(h => h.avg_sentiment || 0);

    return {
      labels,
      datasets: [
        {
          label: "Average Sentiment",
          data: sentiments,
          borderColor: this.colorPalette.info,
          backgroundColor: `${this.colorPalette.info}20`,
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  /**
   * Generate dashboard visualization data
   */
  async generateDashboardData(
    trends: Trend[],
    forecasts: Map<number, any>
  ): Promise<{
    metrics: DashboardMetrics;
    topClustersChart: ChartData;
    trendDistribution: ChartData;
    forecastHeatmap: HeatmapData[];
    alertsTimeline: any[];
  }> {
    // Calculate metrics
    const metrics = this.calculateDashboardMetrics(trends, forecasts);

    // Top clusters bar chart
    const topClustersChart = this.createTopClustersChart(trends);

    // Trend distribution pie chart
    const trendDistribution = this.createTrendDistribution(forecasts);

    // Forecast confidence heatmap
    const forecastHeatmap = this.createForecastHeatmap(forecasts);

    // Alerts timeline
    const alertsTimeline = this.createAlertsTimeline(forecasts);

    return {
      metrics,
      topClustersChart,
      trendDistribution,
      forecastHeatmap,
      alertsTimeline,
    };
  }

  /**
   * Calculate dashboard metrics
   */
  private calculateDashboardMetrics(
    trends: Trend[],
    forecasts: Map<number, any>
  ): DashboardMetrics {
    const totalClusters = trends.length;
    const averageTrendScore = trends.reduce((sum, t) => sum + (t.trend_score || 0), 0) / totalClusters;
    const topGrowthRate = Math.max(...trends.map(t => t.growth_rate || 0));

    let volatilitySum = 0;
    let breakoutCount = 0;

    forecasts.forEach(forecast => {
      volatilitySum += forecast.metrics?.volatility || 0;
      if (forecast.breakoutProbability > 0.7) breakoutCount++;
    });

    const volatilityIndex = forecasts.size > 0 ? volatilitySum / forecasts.size : 0;

    return {
      totalClusters,
      averageTrendScore,
      topGrowthRate,
      volatilityIndex,
      breakoutClusters: breakoutCount,
    };
  }

  /**
   * Create top clusters bar chart
   */
  private createTopClustersChart(trends: Trend[]): ChartData {
    const topTrends = trends.slice(0, 10);
    const labels = topTrends.map((t, i) => `Cluster ${t.cluster_id || i}`);
    const scores = topTrends.map(t => t.trend_score || 0);
    const mentions = topTrends.map(t => t.mention_count || 0);

    return {
      labels,
      datasets: [
        {
          label: "Trend Score",
          data: scores,
          backgroundColor: this.colorPalette.primary,
        },
        {
          label: "Mention Count",
          data: mentions,
          backgroundColor: this.colorPalette.secondary,
        },
      ],
    };
  }

  /**
   * Create trend distribution pie chart
   */
  private createTrendDistribution(forecasts: Map<number, any>): ChartData {
    const distribution = {
      rising: 0,
      falling: 0,
      stable: 0,
      volatile: 0,
    };

    forecasts.forEach(forecast => {
      const trend = forecast.metrics?.trend || "stable";
      distribution[trend as keyof typeof distribution]++;
    });

    return {
      labels: ["Rising", "Falling", "Stable", "Volatile"],
      datasets: [
        {
          label: "Trend Distribution",
          data: Object.values(distribution),
          backgroundColor: [
            this.colorPalette.success,
            this.colorPalette.danger,
            this.colorPalette.info,
            this.colorPalette.warning,
          ],
        },
      ],
    };
  }

  /**
   * Create forecast confidence heatmap
   */
  private createForecastHeatmap(forecasts: Map<number, any>): HeatmapData[] {
    const heatmapData: HeatmapData[] = [];

    forecasts.forEach((forecast, clusterId) => {
      if (!forecast.predictions) return;

      forecast.predictions.forEach((pred: any, idx: number) => {
        if (idx % 24 === 0) { // Sample every 24 hours
          heatmapData.push({
            x: `Cluster ${clusterId}`,
            y: new Date(pred.timestamp).toLocaleDateString(),
            value: pred.confidence,
          });
        }
      });
    });

    return heatmapData;
  }

  /**
   * Create alerts timeline
   */
  private createAlertsTimeline(forecasts: Map<number, any>): any[] {
    const timeline: any[] = [];

    forecasts.forEach((forecast, clusterId) => {
      if (forecast.breakoutProbability > 0.7) {
        timeline.push({
          timestamp: new Date(),
          clusterId,
          type: "breakout",
          severity: "high",
          message: `High breakout probability (${(forecast.breakoutProbability * 100).toFixed(0)}%)`,
        });
      }

      if (forecast.metrics?.trend === "volatile") {
        timeline.push({
          timestamp: new Date(),
          clusterId,
          type: "volatility",
          severity: "medium",
          message: `High volatility detected (${(forecast.metrics.volatility * 100).toFixed(0)}%)`,
        });
      }

      if (forecast.metrics?.momentum < -0.5) {
        timeline.push({
          timestamp: new Date(),
          clusterId,
          type: "decline",
          severity: "medium",
          message: `Rapid decline in momentum (${(forecast.metrics.momentum * 100).toFixed(0)}%)`,
        });
      }
    });

    return timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Generate comparison chart for multiple clusters
   */
  generateComparisonChart(
    clusters: Array<{ id: number; data: Trend[] }>
  ): ChartData {
    const allDates = new Set<string>();
    clusters.forEach(cluster => {
      cluster.data.forEach(trend => {
        allDates.add(new Date(trend.period_end).toLocaleDateString());
      });
    });

    const labels = Array.from(allDates).sort();
    const datasets = clusters.map((cluster, idx) => {
      const dataMap = new Map<string, number>();
      cluster.data.forEach(trend => {
        const date = new Date(trend.period_end).toLocaleDateString();
        dataMap.set(date, trend.mention_count || 0);
      });

      return {
        label: `Cluster ${cluster.id}`,
        data: labels.map(date => dataMap.get(date) || 0),
        borderColor: Object.values(this.colorPalette)[idx % Object.values(this.colorPalette).length],
        fill: false,
        tension: 0.4,
      };
    });

    return { labels, datasets };
  }

  /**
   * Generate sparkline data for mini charts
   */
  generateSparkline(data: number[]): {
    values: number[];
    trend: "up" | "down" | "stable";
    color: string;
  } {
    const values = data.slice(-20); // Last 20 points
    const firstValue = values[0] || 0;
    const lastValue = values[values.length - 1] || 0;

    let trend: "up" | "down" | "stable";
    let color: string;

    if (lastValue > firstValue * 1.1) {
      trend = "up";
      color = this.colorPalette.success;
    } else if (lastValue < firstValue * 0.9) {
      trend = "down";
      color = this.colorPalette.danger;
    } else {
      trend = "stable";
      color = this.colorPalette.neutral;
    }

    return { values, trend, color };
  }

  /**
   * Export chart configuration for frontend
   */
  getChartConfig(type: "line" | "bar" | "pie" | "heatmap"): any {
    const baseConfig = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top" as const,
        },
        tooltip: {
          mode: "index" as const,
          intersect: false,
        },
      },
    };

    switch (type) {
      case "line":
        return {
          ...baseConfig,
          scales: {
            x: {
              display: true,
              grid: {
                display: false,
              },
            },
            y: {
              display: true,
              grid: {
                color: "rgba(0, 0, 0, 0.1)",
              },
            },
          },
        };

      case "bar":
        return {
          ...baseConfig,
          scales: {
            x: {
              display: true,
              grid: {
                display: false,
              },
            },
            y: {
              display: true,
              beginAtZero: true,
            },
          },
        };

      case "pie":
        return {
          ...baseConfig,
          plugins: {
            ...baseConfig.plugins,
            legend: {
              position: "right" as const,
            },
          },
        };

      case "heatmap":
        return {
          ...baseConfig,
          scales: {
            x: {
              type: "category" as const,
              display: true,
            },
            y: {
              type: "category" as const,
              display: true,
            },
          },
          plugins: {
            ...baseConfig.plugins,
            tooltip: {
              callbacks: {
                label: (context: any) => {
                  return `Confidence: ${(context.parsed.value * 100).toFixed(0)}%`;
                },
              },
            },
          },
        };

      default:
        return baseConfig;
    }
  }
}