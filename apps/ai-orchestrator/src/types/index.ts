import { Database } from "./database";

// Raw post structure from MongoDB service
export interface RawPost {
  id: string;
  title: string;
  body: string;
  author: {
    name: string;
  };
  score: number;
  numComments?: number;
  subreddit?: {
    display_name: string;
  };
  permalink?: string;
  createdUtc?: number;
  url: string;
  isNsfw?: boolean;
  metadata?: Record<string, any>;
}

// Processing results (stored in Postgres for analysis)
export type ProcessedPost = Database["public"]["Tables"]["posts"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Cluster = Database["public"]["Tables"]["clusters"]["Row"];
export type Mention = Database["public"]["Tables"]["mentions"]["Row"];
export type Trend = Database["public"]["Tables"]["trends"]["Row"];
export type AuditLog = Database["public"]["Tables"]["audit_log"]["Row"];

export type PostClassificationType =
  Database["public"]["Enums"]["post_classification"];
export type SentimentLabelType = Database["public"]["Enums"]["sentiment_label"];
export type PostType = Database["public"]["Enums"]["post_type"];

export interface AgentContext {
  postId: string;
  post: RawPost;
  processedData: Partial<ProcessedPost>;
  metadata: Record<string, any>;
}

// Processing request payload
export interface ProcessPostRequest {
  post: RawPost;
}

export interface TrendScore {
  avg_sentiment: number;
  current_count: number;
  growth_rate: number;
  previous_count: number;
}

export interface AgentResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed?: number;
  latencyMs: number;
}

// Enhanced clustering interfaces
export interface PostForClustering {
  idx: number;
  id: string;
  source: string;
  body: string;
  keywords: string[];
  category_id: number | null;
  classification: string;
  classification_confidence: number;
  created_at?: string;
  [key: string]: any;
}

export interface ClusterMetadata {
  keywords: string[];
  sources: { [source: string]: number };
  aggregated_confidence: number;
  first_seen: string;
  last_seen: string;
}

export interface EnhancedCluster {
  id: number;
  name: string;
  type: "problem" | "solution";
  description: string;
  centroid: string;
  category_id: number | null;
  member_count: number;
  member_ids: string[];
  representative_post_id: string;
  metadata: ClusterMetadata;
  created_at: string;
  last_recomputed_at: string | null;
}

export interface ClusteringResult {
  clusters: EnhancedCluster[];
  unclustered: string[];
}
