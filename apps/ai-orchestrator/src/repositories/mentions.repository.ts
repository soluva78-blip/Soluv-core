import { SupabaseClient } from "@/lib/supabase";
import { Cluster, Mention, TrendScore } from "@/types";

export class MentionsRepository {
  private table = "mentions" as const;

  constructor(private supabase: SupabaseClient) {}

  private toSnakeCase(field: string): string {
    return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private mapToSnakeCase(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [this.toSnakeCase(k), v])
    );
  }

  async create(
    postId: string,
    clusterId?: number,
    categoryId?: number,
    sentimentScore?: number
  ): Promise<Mention> {
    const insertData = this.mapToSnakeCase({
      postId,
      clusterId,
      categoryId,
      sentimentScore,
    });

    const { data, error } = await this.supabase
      .from(this.table)
      .insert(insertData)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async getMentionsByCluster(
    clusterId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Mention[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select("*")
      .eq("cluster_id", clusterId)
      .gte("mentioned_at", startDate.toISOString())
      .lte("mentioned_at", endDate.toISOString())
      .order("mentioned_at", { ascending: false });

    if (error) throw error;

    return data ?? [];
  }

  async calculateTrendScore(
    clusterId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TrendScore[]> {
    const { data, error } = await this.supabase.rpc("calculate_trend_score", {
      p_cluster_id: clusterId,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
    });

    if (error) throw error;
    return data;
  }
}
