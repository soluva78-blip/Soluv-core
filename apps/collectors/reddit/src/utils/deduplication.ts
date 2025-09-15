/**
 * Removes duplicate posts from an array based on their ID
 * @template T - Type extending an object with an 'id' property of type string
 * @param {T[]} posts - Array of posts to deduplicate
 * @returns {T[]} Array with duplicate posts removed
 */
export const deduplicatePosts = <T extends { id: string }>(posts: T[]): T[] => {
  const seen = new Set();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
};
