export interface RawRedditPost {
  id: string;
  name: string;
  title: string;
  selftext?: string;
  author: string;
  score: number;
  num_comments: number;
  subreddit: string;
  permalink: string;
  created_utc: number;
  url: string;
  over_18?: boolean;
}

export interface RedditPost {
  id: string;
  title: string;
  body: string | null;
  author: string;
  score: number;
  numComments: number;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  url: string;
  isNsfw: boolean;
  fetchedAt: number;
  detailedPostScoreBreakdown?: ProblemRelevanceScore;
}

export type RedditRssItem = {
  guid?: string;
  link?: string;
  title?: string;
  contentSnippet?: string;
  creator?: string;
};

export interface ProblemRelevanceScore {
  keywordScore: number;
  contextScore: number;
  engagementScore: number;
  authorityScore: number;
  freshnessScore: number;
  total: number;
}
