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
