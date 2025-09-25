export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string | null
          agent_name: string | null
          created_at: string | null
          error: string | null
          id: number
          input: Json | null
          latency_ms: number | null
          output: Json | null
          post_id: string | null
          tokens_used: number | null
        }
        Insert: {
          action?: string | null
          agent_name?: string | null
          created_at?: string | null
          error?: string | null
          id?: number
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          post_id?: string | null
          tokens_used?: number | null
        }
        Update: {
          action?: string | null
          agent_name?: string | null
          created_at?: string | null
          error?: string | null
          id?: number
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          post_id?: string | null
          tokens_used?: number | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
          parent_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
          parent_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          parent_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          category_id: number | null
          centroid: string
          created_at: string | null
          id: number
          last_recomputed_at: string | null
          member_count: number | null
          metadata: Json | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          category_id?: number | null
          centroid: string
          created_at?: string | null
          id?: number
          last_recomputed_at?: string | null
          member_count?: number | null
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: number | null
          centroid?: string
          created_at?: string | null
          id?: number
          last_recomputed_at?: string | null
          member_count?: number | null
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clusters_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          category_id: number | null
          cluster_id: number | null
          engagement_score: number | null
          id: number
          mentioned_at: string | null
          post_id: string | null
          sentiment_score: number | null
        }
        Insert: {
          category_id?: number | null
          cluster_id?: number | null
          engagement_score?: number | null
          id?: number
          mentioned_at?: string | null
          post_id?: string | null
          sentiment_score?: number | null
        }
        Update: {
          category_id?: number | null
          cluster_id?: number | null
          engagement_score?: number | null
          id?: number
          mentioned_at?: string | null
          post_id?: string | null
          sentiment_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mentions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author: string
          body: string
          category_id: number | null
          classification:
            | Database["public"]["Enums"]["post_classification"]
            | null
          classification_confidence: number | null
          cluster_id: number | null
          created_at: string | null
          description: string | null
          embedding: string | null
          error_message: string | null
          failed_at: string | null
          has_pii: boolean | null
          id: string
          is_spam: boolean | null
          is_valid: boolean | null
          keywords: string[] | null
          metadata: Json | null
          moderation_notes: string | null
          name: string | null
          post_type: Database["public"]["Enums"]["post_type"] | null
          processed_at: string | null
          processing_started_at: string | null
          retry_count: number | null
          score: number | null
          sentiment_label: Database["public"]["Enums"]["sentiment_label"] | null
          sentiment_score: number | null
          source: string
          status: Database["public"]["Enums"]["post_status"] | null
          summary: string | null
          title: string
          updated_at: string | null
          url: string
          validity_reason: string | null
        }
        Insert: {
          author: string
          body: string
          category_id?: number | null
          classification?:
            | Database["public"]["Enums"]["post_classification"]
            | null
          classification_confidence?: number | null
          cluster_id?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          error_message?: string | null
          failed_at?: string | null
          has_pii?: boolean | null
          id: string
          is_spam?: boolean | null
          is_valid?: boolean | null
          keywords?: string[] | null
          metadata?: Json | null
          moderation_notes?: string | null
          name?: string | null
          post_type?: Database["public"]["Enums"]["post_type"] | null
          processed_at?: string | null
          processing_started_at?: string | null
          retry_count?: number | null
          score?: number | null
          sentiment_label?:
            | Database["public"]["Enums"]["sentiment_label"]
            | null
          sentiment_score?: number | null
          source: string
          status?: Database["public"]["Enums"]["post_status"] | null
          summary?: string | null
          title: string
          updated_at?: string | null
          url: string
          validity_reason?: string | null
        }
        Update: {
          author?: string
          body?: string
          category_id?: number | null
          classification?:
            | Database["public"]["Enums"]["post_classification"]
            | null
          classification_confidence?: number | null
          cluster_id?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          error_message?: string | null
          failed_at?: string | null
          has_pii?: boolean | null
          id?: string
          is_spam?: boolean | null
          is_valid?: boolean | null
          keywords?: string[] | null
          metadata?: Json | null
          moderation_notes?: string | null
          name?: string | null
          post_type?: Database["public"]["Enums"]["post_type"] | null
          processed_at?: string | null
          processing_started_at?: string | null
          retry_count?: number | null
          score?: number | null
          sentiment_label?:
            | Database["public"]["Enums"]["sentiment_label"]
            | null
          sentiment_score?: number | null
          source?: string
          status?: Database["public"]["Enums"]["post_status"] | null
          summary?: string | null
          title?: string
          updated_at?: string | null
          url?: string
          validity_reason?: string | null
        }
        Relationships: []
      }
      trends: {
        Row: {
          avg_sentiment: number | null
          calculated_at: string | null
          category_id: number | null
          cluster_id: number | null
          growth_rate: number | null
          id: number
          mention_count: number | null
          metadata: Json | null
          period_end: string
          period_start: string
          trend_score: number | null
        }
        Insert: {
          avg_sentiment?: number | null
          calculated_at?: string | null
          category_id?: number | null
          cluster_id?: number | null
          growth_rate?: number | null
          id?: number
          mention_count?: number | null
          metadata?: Json | null
          period_end: string
          period_start: string
          trend_score?: number | null
        }
        Update: {
          avg_sentiment?: number | null
          calculated_at?: string | null
          category_id?: number | null
          cluster_id?: number | null
          growth_rate?: number | null
          id?: number
          mention_count?: number | null
          metadata?: Json | null
          period_end?: string
          period_start?: string
          trend_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trends_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trends_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_post_lock: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      calculate_trend_score: {
        Args: {
          p_cluster_id: number
          p_period_end: string
          p_period_start: string
        }
        Returns: {
          avg_sentiment: number
          current_count: number
          growth_rate: number
          previous_count: number
        }[]
      }
      find_nearest_cluster: {
        Args:
          | { p_embedding: string; p_threshold: number }
          | { p_embedding: string; p_threshold: number }
        Returns: {
          centroid: string
          id: number
          member_count: number
          name: string
          similarity: number
        }[]
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      increment_member_count: {
        Args: { p_cluster_id: number }
        Returns: undefined
      }
      increment_retry: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      post_classification:
        | "bug"
        | "feature_request"
        | "question"
        | "discussion"
        | "documentation"
        | "other"
      post_status: "unprocessed" | "processing" | "processed" | "failed"
      post_type: "problem" | "solution"
      sentiment_label: "positive" | "neutral" | "negative"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      post_classification: [
        "bug",
        "feature_request",
        "question",
        "discussion",
        "documentation",
        "other",
      ],
      post_status: ["unprocessed", "processing", "processed", "failed"],
      post_type: ["problem", "solution"],
      sentiment_label: ["positive", "neutral", "negative"],
    },
  },
} as const
