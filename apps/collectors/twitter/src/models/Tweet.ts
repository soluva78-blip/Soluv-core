import mongoose, { Document, Schema } from 'mongoose';

export interface ITweet extends Document {
  tweetId: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  createdAt: Date;
  metrics: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    impressionCount?: number;
  };
  conversationId?: string;
  referencedTweets?: Array<{
    type: string;
    id: string;
  }>;
  entities?: {
    hashtags?: Array<{ tag: string }>;
    mentions?: Array<{ username: string }>;
    urls?: Array<{ url: string; expanded_url: string }>;
  };
  lang?: string;
  processed: boolean;
  processedAt?: Date;
  fetchedAt: Date;
  searchQuery?: string;
}

const TweetSchema = new Schema<ITweet>({
  tweetId: { type: String, required: true, unique: true, index: true },
  text: { type: String, required: true },
  authorId: { type: String, required: true, index: true },
  authorUsername: { type: String, required: true },
  authorName: { type: String, required: true },
  createdAt: { type: Date, required: true },
  metrics: {
    retweetCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    quoteCount: { type: Number, default: 0 },
    impressionCount: { type: Number }
  },
  conversationId: String,
  referencedTweets: [{
    type: { type: String },
    id: String
  }],
  entities: {
    hashtags: [{ tag: String }],
    mentions: [{ username: String }],
    urls: [{
      url: String,
      expanded_url: String
    }]
  },
  lang: String,
  processed: { type: Boolean, default: false, index: true },
  processedAt: Date,
  fetchedAt: { type: Date, default: Date.now },
  searchQuery: String
});

TweetSchema.index({ createdAt: -1 });
TweetSchema.index({ processed: 1, createdAt: -1 });

export const Tweet = mongoose.model<ITweet>('Tweet', TweetSchema);