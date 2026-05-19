import { SupabaseClient } from "@/lib/supabase";
import { Cluster } from "@/types";

export class ClustersRepository {
  private table = "clusters" as const;

  constructor(private supabase: SupabaseClient) {}

  /** ---------------- Utils ---------------- */

  private buildSelect<T extends keyof any>(fields?: T[]): string {
    return fields?.length
      ? fields.map((f) => this.toSnakeCase(String(f))).join(", ")
      : "*";
  }

  private toSnakeCase(field: string): string {
    return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private mapToSnakeCase(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [this.toSnakeCase(k), v])
    );
  }

  /** ---------------- Base CRUD ---------------- */

  async findAll(): Promise<Cluster[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  async findById<T = any>(id: number, fields?: (keyof T)[]): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(this.buildSelect(fields))
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data as unknown as T | null;
  }

  async create(data: {
    name?: string;
    centroid: number[];
    memberCount?: number;
    categoryId?: number;
    metadata?: any;
    type?: "problem" | "solution";
    description?: string;
    representativePostId?: string;
    memberIds?: string[];
  }): Promise<Cluster> {
    const insertData = {
      name: data.name || `Cluster_${Date.now()}`,
      centroid: data.centroid,
      member_count: data.memberCount || 1,
      category_id: data.categoryId,
      metadata: data.metadata || {},
      type: data.type || "problem",
      description: data.description,
      representative_post_id: data.representativePostId,
      member_ids: data.memberIds || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: result, error } = await this.supabase
      .from(this.table)
      .insert({
        ...insertData,
        centroid: `[${insertData.centroid.join(",")}]`, // Convert array to string for pgvector
      })
      .select("*")
      .single();

    if (error) throw error;
    return result as Cluster;
  }

  async updateById(id: number, updates: Record<string, any>): Promise<Cluster> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(this.mapToSnakeCase(updates))
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async deleteById(id: number): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  /** ---------------- Domain-specific methods ---------------- */

  async findNearestCluster(embedding: number[], threshold: number) {
    const embeddingString = `[${embedding.join(",")}]`;

    const { data, error } = await this.supabase.rpc("find_nearest_cluster", {
      p_embedding: embeddingString,
      p_threshold: threshold,
    });

    if (error) throw error;
    return data ?? null;
  }

  async incrementMemberCount(clusterId: number): Promise<void> {
    const { data, error: fetchError } = await this.supabase
      .from(this.table)
      .select("member_count")
      .eq("id", clusterId)
      .single();

    if (fetchError) throw fetchError;

    const currentCount = data?.member_count ?? 0;

    // update
    const { error: updateError } = await this.supabase
      .from(this.table)
      .update({ member_count: currentCount + 1 })
      .eq("id", clusterId);

    if (updateError) throw updateError;
  }

  async updateCentroid(
    clusterId: number,
    newCentroid: number[],
    newMemberCount: number
  ): Promise<void> {
    await this.updateById(clusterId, {
      centroid: `[${newCentroid.join(",")}]`, // Convert array to string for pgvector
      memberCount: newMemberCount,
      updatedAt: new Date().toISOString(),
    });
  }

  async getClusterMembers(clusterId: number): Promise<any[]> {
    const { data, error } = await this.supabase
      .from("posts")
      .select("embedding")
      .eq("cluster_id", clusterId)
      .not("embedding", "is", null);

    if (error) throw error;
    return data ?? [];
  }

  async recomputeCentroid(clusterId: number): Promise<void> {
    const members = await this.getClusterMembers(clusterId);
    if (members.length === 0) return;

    const dimensions = members[0].embedding.length;
    const avgEmbedding = new Array(dimensions).fill(0);

    for (const member of members) {
      for (let i = 0; i < dimensions; i++) {
        avgEmbedding[i] += member.embedding[i];
      }
    }
    for (let i = 0; i < dimensions; i++) {
      avgEmbedding[i] /= members.length;
    }

    await this.updateCentroid(clusterId, avgEmbedding, members.length);
  }

  async addPostToCluster(clusterId: number, postId: string): Promise<void> {
    // TODO: Run migration script first to add these functions to database
    // For now, update member_ids array manually
    const cluster = await this.findById(clusterId);
    if (!cluster) return;

    const currentMemberIds = cluster.member_ids || [];
    if (!currentMemberIds.includes(postId)) {
      const updatedMemberIds = [...currentMemberIds, postId];
      await this.updateById(clusterId, { memberIds: updatedMemberIds });
    }
  }

  async removePostFromCluster(clusterId: number, postId: string): Promise<void> {
    // TODO: Run migration script first to add these functions to database
    // For now, update member_ids array manually
    const cluster = await this.findById(clusterId);
    if (!cluster) return;

    const currentMemberIds = cluster.member_ids || [];
    const updatedMemberIds = currentMemberIds.filter((id: string) => id !== postId);
    await this.updateById(clusterId, { memberIds: updatedMemberIds });
  }

  async updateClusterType(clusterId: number, type: "problem" | "solution"): Promise<void> {
    await this.updateById(clusterId, { type });
  }

  async updateClusterDescription(clusterId: number, description: string): Promise<void> {
    await this.updateById(clusterId, { description });
  }

  async updateRepresentativePost(clusterId: number, postId: string): Promise<void> {
    await this.updateById(clusterId, { representativePostId: postId });
  }
}
