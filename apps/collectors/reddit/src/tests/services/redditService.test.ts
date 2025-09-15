import { ProblemKeywordFilter } from "../../filters/problemKeywordFilter";
import { RedditService } from "../../services/reddit.service";
import { RedditPost } from "../../types";

// Mock Snoowrap client
const mockClient = {
  getSubreddit: jest.fn().mockReturnValue({
    getTop: jest.fn().mockResolvedValue([{ id: "1", title: "top post" }]),
    getNew: jest.fn().mockResolvedValue([{ id: "2", title: "new post" }]),
    search: jest.fn().mockResolvedValue([{ id: "3", title: "search post" }]),
  }),
} as any;

describe("RedditService", () => {
  let service: RedditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedditService(mockClient);
  });
  afterAll(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("fetchTopPostsFromSubreddit should map raw posts", async () => {
    const result = await service.fetchTopPostsFromSubreddit("test");
    expect(result[0]?.id).toBe("1");
  });

  it("fetchNewPostsFromSubreddit should map raw posts", async () => {
    const result = await service.fetchNewPostsFromSubreddit("test");
    expect(result[0]?.id).toBe("2");
  });

  it("fetchPostsBySearch should map search results", async () => {
    const result = await service.fetchPostsBySearch("test", "query");
    expect(result[0]?.id).toBe("3");
  });

  it("fetchRedditPostViaRssFeed should parse and score RSS posts", async () => {
    // Mock parser
    (service as any).parser.parseURL = jest.fn().mockResolvedValue({
      items: [
        {
          guid: "rss1",
          title: "rss post",
          link: "http://test.com",
          contentSnippet: "rss body",
          creator: "author",
        },
      ],
    });

    const posts = await service.fetchRedditPostViaRssFeed("testsub");
    expect(posts[0]?.id).toBe("rss1");
  });

  it("run should fetch, deduplicate, and return posts", async () => {
    const posts = await service.run(["testsub"], "problem");
    expect(posts.length).toBeGreaterThan(0);
  });
});

describe("ProblemKeywordFilter", () => {
  afterAll(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });
  const filter = new ProblemKeywordFilter();

  const basePost: RedditPost = {
    id: "1",
    title: "",
    body: "",
    author: "test",
    score: 10,
    numComments: 2,
    subreddit: "test",
    permalink: "link",
    createdUtc: Date.now() / 1000,
    url: "url",
    isNsfw: false,
    fetchedAt: Date.now(),
  };

  it("returns zero score if exclusion keyword found", () => {
    const post = { ...basePost, title: "This is a meme" };
    const score = filter.calculateRelevanceScore(post);
    expect(score.total).toBe(0);
  });

  it("scores strong keywords higher", () => {
    const post = { ...basePost, title: "I have a problem" };
    const score = filter.calculateRelevanceScore(post);
    expect(score.keywordScore).toBeGreaterThan(0);
  });

  it("caps keyword score at 30", () => {
    const post = {
      ...basePost,
      title: "problem issue struggling challenge blocked",
    };
    const score = filter.calculateRelevanceScore(post);
    expect(score.keywordScore).toBe(30);
  });

  it("awards context score for question-like titles", () => {
    const post = { ...basePost, title: "How do I fix this?" };
    const score = filter.calculateRelevanceScore(post);
    expect(score.contextScore).toBe(20);
  });

  it("engagement score capped at 20", () => {
    const post = { ...basePost, numComments: 50 };
    const score = filter.calculateRelevanceScore(post);
    expect(score.engagementScore).toBe(20);
  });

  it("authority score is higher for high score posts", () => {
    const low = filter.calculateRelevanceScore({ ...basePost, score: 5 });
    const mid = filter.calculateRelevanceScore({ ...basePost, score: 25 });
    const high = filter.calculateRelevanceScore({ ...basePost, score: 200 });

    expect(low.authorityScore).toBe(5);
    expect(mid.authorityScore).toBe(10);
    expect(high.authorityScore).toBe(15);
  });

  it("freshness score depends on post age", () => {
    const fresh = filter.calculateRelevanceScore({
      ...basePost,
      createdUtc: Date.now() / 1000,
    });
    const old = filter.calculateRelevanceScore({
      ...basePost,
      createdUtc: (Date.now() - 20 * 24 * 60 * 60 * 1000) / 1000, // 20 days ago
    });

    expect(fresh.freshnessScore).toBe(10);
    expect(old.freshnessScore).toBe(5);
  });
});
