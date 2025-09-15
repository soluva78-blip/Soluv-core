import { RawRedditPost, RedditPost } from "@/types";
import { SoluvaPost } from "@soluva/types/global";
import { Submission } from "snoowrap";

/**
 * Converts a Reddit post to the standardized Soluva post format
 * @param rawPost - The raw Reddit post data
 * @returns A formatted SoluvaPost object with metadata
 */
export const convertToSoluvaPost = (rawPost: RedditPost): SoluvaPost => {
  return {
    id: rawPost.id,
    type: "reddit",
    title: rawPost.title,
    body: rawPost.body || null,
    author: rawPost.author,
    score: rawPost.score,
    url: rawPost.url,
    processed: false,
    metadata: {
      fetchedAt: Date.now(),
      processingVersion: "1.0.0",
      relevanceScore: 0,
      detailedScoreBreakdown: {
        keywordScore: 0,
        contextScore: 0,
        engagementScore: 0,
        authorityScore: 0,
        freshnessScore: 0,
        total: 0,
      },
    },
  };
};

/**
 * Converts a raw Reddit post to the standardized Reddit post format
 * @param rawPost - The raw Reddit post data
 * @returns A formatted SoluvaPost object with metadata
 */
export const convertToRedditPost = (rawPost: RawRedditPost): RedditPost => {
  return {
    id: rawPost.id,
    title: rawPost.title,
    body: rawPost.selftext || null,
    author: rawPost.author,
    score: rawPost.score,
    numComments: rawPost.num_comments,
    subreddit: rawPost.subreddit,
    permalink: rawPost.permalink,
    createdUtc: rawPost.created_utc,
    url: rawPost.url,
    isNsfw: rawPost.over_18 || false,
    fetchedAt: Date.now(),
    detailedPostScoreBreakdown: {
      keywordScore: 0,
      contextScore: 0,
      engagementScore: 0,
      authorityScore: 0,
      freshnessScore: 0,
      total: 0,
    },
  };
};

/**
 * Maps a Snoowrap Submission object to a raw Reddit post format
 * @param submission - The Snoowrap Submission object containing Reddit post data
 * @returns A RawRedditPost object with essential post information
 */
export const mapSubmissionToRawPost = (
  submission: Submission
): RawRedditPost => {
  return {
    id: submission.id,
    name: submission.name,
    title: submission.title,
    selftext: submission.selftext || "",
    author: submission.author.name,
    score: submission.score,
    num_comments: submission.num_comments,
    subreddit: submission.subreddit.display_name,
    permalink: submission.permalink,
    created_utc: submission.created_utc,
    url: submission.url,
    over_18: submission.over_18 || false,
  };
};
