import { Trend } from "@/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { MentionsRepository } from "../repositories/mentions.repository.js";

export class TrendsService {
  private mentionsRepo: MentionsRepository;
  private trendsTable = "trends";

  constructor(private supabase: SupabaseClient) {
    this.mentionsRepo = new MentionsRepository(supabase);
  }

  /** Entry point for orchestrator to compute trends */
  async run(periodHours: number = 24): Promise<void> {
    console.log(
      `[TrendsService] Starting trend calculation for last ${periodHours}h...`
    );

    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - periodHours * 60 * 60 * 1000
    );
    const previousPeriodStart = new Date(
      startTime.getTime() - periodHours * 60 * 60 * 1000
    );

    // Step 1: Load active clusters for the period
    const clusters = await this.loadActiveClusters(
      previousPeriodStart,
      endTime
    );

    // Step 2: Process each cluster as a graph node
    let processedCount = 0;
    for (const cluster of clusters) {
      await this.processClusterNode(
        cluster.id,
        startTime,
        endTime,
        previousPeriodStart,
        startTime
      );
      processedCount++;
    }

    console.log(
      `[TrendsService] Completed trend calculation for ${processedCount} clusters`
    );
  }

  /** Node 1: Load active clusters */
  private async loadActiveClusters(
    start: Date,
    end: Date
  ): Promise<{ id: number }[]> {
    const { data: clusters, error } = await this.supabase.rpc(
      "get_active_clusters_for_period",
      {
        p_start_date: start.toISOString(),
        p_end_date: end.toISOString(),
      }
    );
    if (error) throw error;
    return clusters || [];
  }

  /** Node 2+: Calculate trend for a single cluster */
  private async processClusterNode(
    clusterId: number,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    previousPeriodStart: Date,
    previousPeriodEnd: Date
  ): Promise<void> {
    // Fetch mentions
    const currentMentions = await this.mentionsRepo.getMentionsByCluster(
      clusterId,
      currentPeriodStart,
      currentPeriodEnd
    );
    const previousMentions = await this.mentionsRepo.getMentionsByCluster(
      clusterId,
      previousPeriodStart,
      previousPeriodEnd
    );

    // Aggregate stats
    const currentStats = this.aggregateMentions(currentMentions);
    const previousStats = this.aggregateMentions(previousMentions);

    // Growth rate
    const growthRate =
      previousStats.count === 0
        ? currentStats.count > 0
          ? 1.0
          : 0.0
        : (currentStats.count - previousStats.count) / previousStats.count;

    // Trend score
    const trendScore = this.calculateTrendScore(
      currentStats.count,
      previousStats.count,
      growthRate,
      currentStats.avgSentiment
    );

    // Save trend
    await this.upsertTrend({
      cluster_id: clusterId,
      category_id: null,
      period_start: currentPeriodStart.toISOString(),
      period_end: currentPeriodEnd.toISOString(),
      mention_count: currentStats.count,
      growth_rate: growthRate,
      trend_score: trendScore,
      avg_sentiment: currentStats.avgSentiment,
      metadata: {
        previousCount: previousStats.count,
        avgEngagement: currentStats.avgEngagement,
      },
      calculated_at: new Date().toISOString(),
    });
  }

  /** Helper: Aggregate raw mentions into stats */
  private aggregateMentions(mentions: any[]): {
    count: number;
    avgSentiment: number;
    avgEngagement: number;
  } {
    if (!mentions.length) {
      return { count: 0, avgSentiment: 0, avgEngagement: 0 };
    }

    const totalSentiment = mentions.reduce(
      (sum, m) => sum + (m.sentiment_score ?? 0),
      0
    );
    const totalEngagement = mentions.reduce(
      (sum, m) => sum + (m.engagement_score ?? 0),
      0
    );

    return {
      count: mentions.length,
      avgSentiment: totalSentiment / mentions.length,
      avgEngagement: totalEngagement / mentions.length,
    };
  }

  /** Node helper: calculate trend score */
  private calculateTrendScore(
    currentCount: number,
    previousCount: number,
    growthRate: number,
    avgSentiment: number
  ): number {
    let score = 0;
    // Volume: 0-40 points
    score += Math.min(currentCount * 2, 40);
    // Growth: -30 to +30 points
    score += Math.min(Math.max(growthRate * 30, -30), 30);
    // Sentiment: 0-30 points
    score += (avgSentiment + 1) * 15;
    return Math.max(0, Math.min(100, score));
  }

  /** Node helper: upsert trend into DB */
  private async upsertTrend(
    trend: Omit<Trend, "id" | "calculatedAt">
  ): Promise<void> {
    const { error } = await this.supabase.from(this.trendsTable).upsert(
      {
        ...trend,
        calculated_at: new Date().toISOString(),
      },
      {
        onConflict: "cluster_id,period_start,period_end",
      }
    );
    if (error) throw error;
  }

  /** Optional utility: get top trending clusters */
  async getTopTrending(limit: number = 10): Promise<Trend[]> {
    const { data, error } = await this.supabase
      .from(this.trendsTable)
      .select(
        `
        *,
        clusters!inner(id, name, member_count)
      `
      )
      .gte(
        "period_start",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      )
      .order("trend_score", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as Trend[];
  }
}
