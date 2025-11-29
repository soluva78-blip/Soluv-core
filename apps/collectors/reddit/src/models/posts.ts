import { SoluvaMediumTypes } from "@soluva/types/global";
import { Document, Schema, model } from "mongoose";

interface DetailedScoreBreakdown {
  keywordScore: number;
  contextScore: number;
  engagementScore: number;
  authorityScore: number;
  freshnessScore: number;
  total: number;
}

interface Metadata {
  relevanceScore: number;
  detailedScoreBreakdown: DetailedScoreBreakdown;
}

export interface IPost extends Document {
  id: string | number;
  type: SoluvaMediumTypes;
  title: string;
  body: string;
  author: string;
  score: number;
  url: string;
  metadata: Metadata;
  status: "unprocessed" | "processed";
}

const detailedScoreBreakdownSchema = new Schema<DetailedScoreBreakdown>(
  {
    keywordScore: { type: Number, default: 0 },
    contextScore: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0 },
    authorityScore: { type: Number, default: 0 },
    freshnessScore: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const metadataSchema = new Schema<Metadata>(
  {
    relevanceScore: { type: Number, default: 0 },
    detailedScoreBreakdown: {
      type: detailedScoreBreakdownSchema,
      required: true,
    },
  },
  { _id: false }
);

const postSchema = new Schema<IPost>(
  {
    id: { type: String, required: true },
    type: { type: String, required: false },
    title: { type: String, required: true },
    body: { type: String, required: true },
    author: { type: String, required: false },
    score: { type: Number, default: 0 },
    url: { type: String, required: true },
    metadata: { type: metadataSchema, required: false },
    status: {
      type: String,
      enum: ["unprocessed", "processed"],
      default: "unprocessed",
    },
  },
  { timestamps: true }
);
postSchema.index({ id: 1 }, { unique: true });

export const Post = model<IPost>("Post", postSchema, "posts");
