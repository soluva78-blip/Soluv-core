import { SupabaseClient } from "@/lib/supabase";
import {
  PostClassificationType,
  ProcessedPost,
  SentimentLabelType,
} from "@/types/index";
import { SoluvaPost } from "@soluva/types/global";

interface PostsRepositoryInterface {
  findById<T extends keyof ProcessedPost>(
    id: string,
    fields?: T[]
  ): Promise<Pick<ProcessedPost, T> | null>;

  findMany<T extends keyof ProcessedPost>(
    filters?: Partial<ProcessedPost>,
    fields?: T[],
    limit?: number,
    offset?: number
  ): Promise<Pick<ProcessedPost, T>[]>;

  create(post: SoluvaPost): Promise<ProcessedPost>;

  updateById(
    id: string,
    updates: Partial<ProcessedPost>
  ): Promise<ProcessedPost>;

  deleteById(id: string): Promise<void>;

  acquireLock(id: string): Promise<boolean>;
  releaseLock(
    id: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void>;

  updateValidityCheck(
    id: string,
    isValid: boolean,
    reason?: string
  ): Promise<void>;
  updateClassification(
    id: string,
    classification: string,
    confidence: number
  ): Promise<void>;
  updateSemanticAnalysis(
    id: string,
    summary: string,
    embedding: number[],
    keywords: string[]
  ): Promise<void>;
  updateSentiment(id: string, label: string, score: number): Promise<void>;
  updateCategory(id: string, categoryId: number): Promise<void>;
  updateCluster(id: string, clusterId: number): Promise<void>;
  updateSpamPiiFlags(
    id: string,
    isSpam: boolean,
    hasPii: boolean,
    notes?: string
  ): Promise<void>;
}

export class PostsRepository implements PostsRepositoryInterface {
  private table = "posts" as const;

  constructor(private supabase: SupabaseClient) {}

  /** ---------------- Helpers ---------------- */

  private buildSelect<T extends keyof ProcessedPost>(fields?: T[]): string {
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

  async findById<T extends keyof ProcessedPost>(
    id: string,
    fields?: T[]
  ): Promise<Pick<ProcessedPost, T> | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(this.buildSelect(fields))
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data as unknown as Pick<ProcessedPost, T> | null;
  }

  async findMany<T extends keyof ProcessedPost>(
    filters: Partial<ProcessedPost> = {},
    fields?: T[],
    limit?: number,
    offset?: number
  ): Promise<Pick<ProcessedPost, T>[]> {
    let query = this.supabase.from(this.table).select(this.buildSelect(fields));

    // apply basic filters (eq/in/gte/lte support for simple objects)
    for (const [key, value] of Object.entries(filters)) {
      if (value === null || value === undefined) continue;

      // arrays -> IN
      if (Array.isArray(value)) {
        query = query.in(this.toSnakeCase(key), value as any);
        continue;
      }

      // range object support (e.g. { gte: 10 })
      if (typeof value === "object" && value !== null) {
        const range = value as any;
        if ("gte" in range) query = query.gte(this.toSnakeCase(key), range.gte);
        if ("lte" in range) query = query.lte(this.toSnakeCase(key), range.lte);
        if ("ilike" in range)
          query = query.ilike(this.toSnakeCase(key), range.ilike);
        continue;
      }

      // default eq
      query = query.eq(this.toSnakeCase(key), value as any);
    }

    // pagination: range(start, end)
    if (typeof limit === "number") {
      const start = offset ?? 0;
      const end = start + limit - 1;
      query = query.range(start, end);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []) as unknown as Pick<ProcessedPost, T>[];
  }

  async create(post: SoluvaPost): Promise<ProcessedPost> {
    // stay flexible about author shape
    const author =
      typeof post.author === "object" ? (post.author as any).name : post.author;

    const insertData = this.mapToSnakeCase({
      ...post,
      author,
      metadata: (post as any).metadata ?? {},
      status: "unprocessed",
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from(this.table)
      .upsert(insertData as any, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    return data as ProcessedPost;
  }

  async updateById(
    id: string,
    updates: Partial<ProcessedPost>
  ): Promise<ProcessedPost> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(this.mapToSnakeCase(updates))
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data as ProcessedPost;
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  /** ---------------- Domain-specific updates ---------------- */

  // Uses an atomic RPC in the DB: acquire_post_lock(p_post_id uuid) returns boolean
  async acquireLock(id: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("acquire_post_lock", {
      p_post_id: id,
    } as any);
    if (error) {
      console.error(`acquireLock RPC error for ${id}:`, error);
      return false;
    }

    // rpc() typically returns an array or scalar depending on function definition.
    // We coerce to boolean safely.
    if (Array.isArray(data)) {
      return Boolean((data as any)[0]);
    }
    return Boolean(data) as boolean;
  }

  async releaseLock(
    id: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    if (success) {
      await this.updateById(id, {
        status: "processed",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return;
    }

    // mark failed first
    await this.updateById(id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
      updated_at: new Date().toISOString(),
    });

    // increment retry_count atomically in DB with RPC
    const { error } = await this.supabase.rpc("increment_retry", {
      p_post_id: id,
    } as any);
    if (error) {
      // Log but do not throw — failure to increment is non-fatal here
      console.error(`increment_retry RPC error for ${id}:`, error);
    }
  }

  async updateValidityCheck(
    id: string,
    isValid: boolean,
    reason?: string
  ): Promise<void> {
    await this.updateById(id, {
      is_valid: isValid,
      validity_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  async updateClassification(
    id: string,
    classification: PostClassificationType,
    confidence: number
  ): Promise<void> {
    await this.updateById(id, {
      classification,
      classification_confidence: confidence,
      updated_at: new Date().toISOString(),
    });
  }

  async updateSemanticAnalysis(
    id: string,
    summary: string,
    embedding: number[],
    keywords: string[]
  ): Promise<void> {
    // Supabase accepts JS arrays for pgvector columns when using the service role key.
    // If your Supabase client complains about typing in TS for rpc calls, cast to unknown.
    await this.updateById(id, {
      summary,
      embedding: embedding as unknown as any,
      keywords,
      updated_at: new Date().toISOString(),
    });
  }

  async updateSentiment(
    id: string,
    label: SentimentLabelType,
    score: number
  ): Promise<void> {
    await this.updateById(id, {
      sentiment_label: label,
      sentiment_score: score,
      updated_at: new Date().toISOString(),
    });
  }

  async updateCategory(id: string, categoryId: number): Promise<void> {
    await this.updateById(id, {
      category_id: categoryId,
      updated_at: new Date().toISOString(),
    });
  }

  async updateCluster(id: string, clusterId: number): Promise<void> {
    await this.updateById(id, {
      cluster_id: clusterId,
      updated_at: new Date().toISOString(),
    });
  }

  async updateSpamPiiFlags(
    id: string,
    isSpam: boolean,
    hasPii: boolean,
    notes?: string
  ): Promise<void> {
    await this.updateById(id, {
      is_spam: isSpam,
      has_pii: hasPii,
      moderation_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    });
  }
}
