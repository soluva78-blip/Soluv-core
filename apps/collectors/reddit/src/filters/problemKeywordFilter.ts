import { ProblemRelevanceScore, RedditPost } from "@/types";

/**
 * Configurable, extensible filter system for scoring problem relevance.
 */
export class ProblemKeywordFilter {
  private readonly keywords = {
    strong: ["problem", "issue", "struggling", "challenge", "blocked"],
    moderate: [
      "frustrated",
      "stuck",
      "annoying",
      "waste time",
      "broken",
      "need help",
    ],
    weak: [
      "how do you",
      "how can i",
      "anyone know",
      "what should i",
      "wish there was",
    ],
    exclusions: [
      "meme",
      "shitpost",
      "shit post",
      "joke",
      "spam",
      "bot",
      "giveaway",
      "rt",
      "follow for",
      "follow me",
      "subscribe",
      "like for",
      "free shipping",
    ],
    promoPatterns: [
      /buy now/i,
      /click here/i,
      /visit my/i,
      /discount code/i,
      /use code/i,
      /promo/i,
    ],
  };

  /**
   * Calculates the relevance score of a RedditPost.
   */
  calculateRelevanceScore(post: RedditPost): ProblemRelevanceScore {
    const text = `${post.title} ${post.body || ""}`.toLowerCase();

    if (this.hasAnyMatch(text, this.keywords.exclusions)) {
      return this.zeroScore();
    }

    if (this.keywords.promoPatterns.some((rx) => rx.test(text))) {
      return this.zeroScore();
    }
    if (this.isMostlyLinks(text)) {
      return this.zeroScore();
    }

    const length = text.replace(/\s+/g, "").length;
    if (length < 20) return this.zeroScore();

    /**
     * Calculates keyword-based scores with different weights.
     * Strong keywords: 30 points, moderate: 15 points, weak: 5 points.
     */
    const keywordScore =
      this.countMatches(text, this.keywords.strong) * 30 +
      this.countMatches(text, this.keywords.moderate) * 15 +
      this.countMatches(text, this.keywords.weak) * 5;

    const cappedKeywordScore = Math.min(keywordScore, 30);

    /**
     * Calculates additional scores based on context, engagement, authority, and freshness.
     * Context: 20 points if question-like, 5 otherwise.
     * Engagement: 2 points per comment, capped at 20.
     * Authority: 15 points for high score, 10 for moderate, 5 for low.
     * Freshness: 10 points if within 7 days, 5 otherwise.
     */
    const contextScore = post.title.includes("?") ? 20 : 5;
    const engagementScore = Math.min(20, post.numComments * 2);
    const authorityScore = post.score > 100 ? 15 : post.score > 20 ? 10 : 5;
    const freshnessScore =
      Date.now() / 1000 - post.createdUtc < 7 * 24 * 60 * 60 ? 10 : 5;

    const total = Math.min(
      cappedKeywordScore +
        contextScore +
        engagementScore +
        authorityScore +
        freshnessScore,
      100
    );

    return {
      keywordScore: cappedKeywordScore,
      contextScore,
      engagementScore,
      authorityScore,
      freshnessScore,
      total,
    };
  }

  /**
   *
   * @param text
   * @param keywords
   * @returns
   */

  private countMatches(text: string, keywords: string[]): number {
    return keywords.filter((keyword) => text.includes(keyword.toLowerCase()))
      .length;
  }

  private hasAnyMatch(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  private zeroScore(): ProblemRelevanceScore {
    return {
      keywordScore: 0,
      contextScore: 0,
      engagementScore: 0,
      authorityScore: 0,
      freshnessScore: 0,
      total: 0,
    };
  }

  // If post body is only links or too short, treat as low-quality
  private isMostlyLinks(text: string): boolean {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = (text.match(urlRegex) || []).length;
    // if half or more tokens look like URLs -> low-quality
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    return urls / tokens.length >= 0.5;
  }
}
