export type SoluvaMediumTypes = "reddit" | "medium" | "quora";
/**
 * Structure representing a validated Reddit post.
 */
export interface SoluvaPost {
  /**
   * Unique identifier for the post.
   */
  id?: string;
  /**
   * Title of the post.
   */
  title: string;
  type: SoluvaMediumTypes;
  /**
   * Body text of the post, if applicable.
   */
  body: string | null;
  /**
   * Author of the post.
   */
  author: string;
  /**
   * Score of the post (upvotes - downvotes).
   */
  score: number;
  /**
   * URL of the post, if applicable.
   */
  url: string;
  /**
   * Metadata about the post, including processing details.
   */
  processed: boolean;
  metadata: Record<any, any>;
}
