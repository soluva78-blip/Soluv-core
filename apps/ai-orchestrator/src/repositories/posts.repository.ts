import { SupabaseClient } from "@/lib/supabase";
import { PostClassificationType, ProcessedPost, RawPost } from "@/types/index";

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

  createFromRawPost(rawPost: RawPost): Promise<ProcessedPost>;

  updateById(
    id: string,
    updates: Partial<ProcessedPost>
  ): Promise<ProcessedPost | null>;

  deleteById(id: string): Promise<void>;

  acquireLock(id: string): Promise<boolean>;
  releaseLock(
    id: string,
    success: boolean,
    errorMessage?: string
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
  updateCategory(id: string, categoryId: number): Promise<void>;
  updateCluster(id: string, clusterId: number): Promise<void>;
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

  async createFromRawPost(rawPost: RawPost): Promise<ProcessedPost> {
    const insertData = {
      id: rawPost.id,
      source: rawPost.subreddit?.display_name || "reddit",
      problem_statement: rawPost.title,
      body: rawPost.body,
      author: rawPost.author.name,
      url: rawPost.url,
      status: "processing" as const,
      processing_started_at: new Date().toISOString(),
      metadata: {
        ...rawPost.metadata,
        numComments: rawPost.numComments,
        permalink: rawPost.permalink,
        createdUtc: rawPost.createdUtc,
        isNsfw: rawPost.isNsfw,
        subreddit: rawPost.subreddit,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from(this.table)
      .upsert(insertData, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    return data as ProcessedPost;
  }

  async createDerivedProblem(
    rawPost: RawPost & { description: string }
  ): Promise<ProcessedPost> {
    const insertData = {
      id: `${rawPost.id} - Derived- ${crypto.randomUUID()}`,
      source: rawPost.subreddit?.display_name || "reddit",
      problem_statement: rawPost.title,
      body: rawPost.body,
      author: rawPost.author.name,
      url: rawPost.url,
      status: "processing" as const,
      processing_started_at: new Date().toISOString(),
      description: rawPost.description,
      metadata: {
        ...rawPost.metadata,
        numComments: rawPost.numComments,
        permalink: rawPost.permalink,
        createdUtc: rawPost.createdUtc,
        isNsfw: rawPost.isNsfw,
        subreddit: rawPost.subreddit,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from(this.table)
      .upsert(insertData, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    return data as ProcessedPost;
  }

  async updateById(
    id: string,
    updates: Partial<ProcessedPost>,
    ignoreNonExistent: boolean = false
  ): Promise<ProcessedPost | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(this.mapToSnakeCase(updates))
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      // PGRST116: Resource not found (when row doesn't exist)
      if (error.code === "PGRST116" && ignoreNonExistent) {
        return null;
      }
      throw error;
    }
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
    await this.updateById(id, {
      description: summary,
      embedding: embedding as unknown as any,
      keywords,
      updated_at: new Date().toISOString(),
    });
  }

  async updateCategory(id: string, categoryId: number): Promise<void> {
    await this.updateById(id, {
      category_id: categoryId,
      updated_at: new Date().toISOString(),
    });
  }

  async updateBusinessIdea(id: string, name: string): Promise<void> {
    await this.updateById(id, {
      problem_statement: name,
      updated_at: new Date().toISOString(),
    });
  }

  async updateCluster(id: string, clusterId: number): Promise<void> {
    await this.updateById(id, {
      cluster_id: clusterId,
      updated_at: new Date().toISOString(),
    });
  }
}
