import { OptimizedRedditCollector } from "@/optimizedJob";

function createRateLimitError(): Error & { statusCode: number } {
  const err = new Error("ratelimit") as any;
  err.statusCode = 429;
  return err;
}

function createMockSubmission(id: string) {
  return {
    id,
    name: `t3_${id}`,
    title: `post ${id}`,
    selftext: "",
    author: { name: "user" },
    score: 1,
    num_comments: 0,
    subreddit: { display_name: "test" },
    permalink: "/r/test/comments/x",
    created_utc: Date.now() / 1000,
    url: "http://example.com",
    over_18: false,
  };
}

describe("Token rotation on rate-limit", () => {
  /**
   * Verifies that the collector rotates to the next client and applies a local cooldown
   * when the current client returns HTTP 429.
   */
  it("switches to next client and cools down current on 429", async () => {
    const failingClient = {
      getSubreddit: () => ({
        getNew: jest.fn().mockRejectedValue(createRateLimitError()),
        getHot: jest.fn().mockRejectedValue(createRateLimitError()),
        getTop: jest.fn().mockRejectedValue(createRateLimitError()),
        getRising: jest.fn().mockRejectedValue(createRateLimitError()),
        getControversial: jest.fn().mockRejectedValue(createRateLimitError()),
      }),
      config: jest.fn(),
    };

    const healthyClient = {
      getSubreddit: () => ({
        getNew: jest.fn().mockResolvedValue([createMockSubmission("b1")]),
        getHot: jest.fn().mockResolvedValue([createMockSubmission("b2")]),
        getTop: jest.fn().mockResolvedValue([createMockSubmission("b3")]),
        getRising: jest.fn().mockResolvedValue([createMockSubmission("b4")]),
        getControversial: jest
          .fn()
          .mockResolvedValue([createMockSubmission("b5")]),
      }),
      config: jest.fn(),
    };

    const mockRedis = {
      multi: () => ({
        exec: jest.fn().mockResolvedValue([]),
        sismember: jest.fn(),
      }),
      pipeline: () => ({ exec: jest.fn(), sadd: jest.fn() }),
      sadd: jest.fn(),
      expire: jest.fn(),
    };

    const collector = new OptimizedRedditCollector({
      subreddits: ["test"],
      targetPostsPerRun: 1,
      maxConcurrency: 1,
      redisClient: mockRedis,
      credentials: [
        {
          userAgent: "ua",
          clientId: "id1",
          clientSecret: "sec1",
          username: "u1",
          password: "p1",
        },
        {
          userAgent: "ua",
          clientId: "id2",
          clientSecret: "sec2",
          username: "u2",
          password: "p2",
        },
      ],
    } as any);

    // Inject stubbed clients and reset cooldowns
    (collector as any).clients = [failingClient, healthyClient];
    (collector as any).clientIndex = 0;
    (collector as any).client = failingClient;
    (collector as any).clientCooldownUntil = [0, 0];

    const posts = await (collector as any).executeSamplingStrategy({
      subreddit: "test",
      sort: "new",
      limit: 1,
    });

    expect(Array.isArray(posts)).toBe(true);
    expect(posts).toHaveLength(1);

    // Ensure cooldown applied to first client
    const cooldowns = (collector as any).clientCooldownUntil as number[];
    expect(cooldowns[0]).toBeGreaterThan(Date.now());

    // Ensure we switched to healthyClient for the successful fetch
    expect((collector as any).clientIndex).toBe(1);
  });

  /**
   * Ensures that once a client's cooldown expires it becomes eligible again
   * and can successfully serve requests.
   */
  it("returns to cooled down client after expiry and succeeds", async () => {
    const mockGetNewForClientA = jest
      .fn()
      .mockRejectedValueOnce(createRateLimitError())
      .mockResolvedValueOnce([createMockSubmission("a1")]);

    const clientA = {
      getSubreddit: () => ({
        getNew: mockGetNewForClientA,
      }),
      config: jest.fn(),
    } as any;

    const clientB = {
      getSubreddit: () => ({
        getNew: jest.fn().mockResolvedValue([createMockSubmission("b1")]),
      }),
      config: jest.fn(),
    } as any;

    const mockRedis = {
      multi: () => ({ exec: jest.fn() }),
      pipeline: () => ({ exec: jest.fn() }),
      sadd: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
    } as any;

    const collector = new OptimizedRedditCollector({
      subreddits: ["test"],
      targetPostsPerRun: 1,
      maxConcurrency: 1,
      redisClient: mockRedis,
      credentials: [
        {
          userAgent: "ua",
          clientId: "id1",
          clientSecret: "sec1",
          username: "u1",
          password: "p1",
        },
        {
          userAgent: "ua",
          clientId: "id2",
          clientSecret: "sec2",
          username: "u2",
          password: "p2",
        },
      ],
    });

    (collector as any).clients = [clientA, clientB];
    (collector as any).clientIndex = 0;
    (collector as any).client = clientA;
    (collector as any).clientCooldownUntil = [0, 0];

    const strat = { subreddit: "test", sort: "new", limit: 1 };
    const first = await (collector as any).executeSamplingStrategy(strat);
    expect(first).toHaveLength(1); // served by clientB

    const now = Date.now();
    (collector as any).clientCooldownUntil[0] = now - 1; // past cooldown
    (collector as any).clientCooldownUntil[1] = now - 1; // ensure B is also ready
    (collector as any).clientIndex = 0;

    mockRedis.get.mockImplementation((key: string) => {
      if (key === "cooldown:0") return Promise.resolve(String(now - 1));
      if (key === "cooldown:1") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const second = await (collector as any).executeSamplingStrategy(strat);
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe("a1");
  });

  /**
   * Confirms that the collector can rotate through three clients when the first two
   * return rate-limit errors and the third succeeds.
   */
  it("nested rotation with 3 clients: A→429, B→429, C succeeds", async () => {
    const clientA = {
      getSubreddit: () => ({
        getNew: jest.fn().mockRejectedValue(createRateLimitError()),
      }),
      config: jest.fn(),
    } as any;

    const clientB = {
      getSubreddit: () => ({
        getNew: jest.fn().mockRejectedValue(createRateLimitError()),
      }),
      config: jest.fn(),
    } as any;

    const clientC = {
      getSubreddit: () => ({
        getNew: jest.fn().mockResolvedValue([createMockSubmission("c1")]),
      }),
      config: jest.fn(),
    } as any;

    const mockRedis = {
      multi: () => ({ exec: jest.fn() }),
      pipeline: () => ({ exec: jest.fn() }),
      sadd: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
    } as any;

    const collector = new OptimizedRedditCollector({
      subreddits: ["test"],
      targetPostsPerRun: 1,
      maxConcurrency: 1,
      redisClient: mockRedis,
      credentials: [
        {
          userAgent: "ua",
          clientId: "id1",
          clientSecret: "sec1",
          username: "u1",
          password: "p1",
        },
        {
          userAgent: "ua",
          clientId: "id2",
          clientSecret: "sec2",
          username: "u2",
          password: "p2",
        },
        {
          userAgent: "ua",
          clientId: "id3",
          clientSecret: "sec3",
          username: "u3",
          password: "p3",
        },
      ],
    } as any);

    (collector as any).clients = [clientA, clientB, clientC];
    (collector as any).clientIndex = 0;
    (collector as any).client = clientA;
    (collector as any).clientCooldownUntil = [0, 0, 0];

    const posts = await (collector as any).executeSamplingStrategy({
      subreddit: "test",
      sort: "new",
      limit: 1,
    });

    expect(posts).toHaveLength(1);
    expect((collector as any).clientIndex).toBe(2);
    expect((collector as any).clientCooldownUntil[0]).toBeGreaterThan(
      Date.now()
    );
    expect((collector as any).clientCooldownUntil[1]).toBeGreaterThan(
      Date.now()
    );
  });

  /**
   * Validates that when every client is rate-limited the collector returns
   * an empty array and applies cooldowns to all clients.
   */
  it("full exhaustion: all clients 429 → returns empty and logs", async () => {
    const alwaysFailingClient = {
      getSubreddit: () => ({
        getNew: jest.fn().mockRejectedValue(createRateLimitError()),
      }),
      config: jest.fn(),
    } as any;

    const mockRedis = {
      multi: () => ({ exec: jest.fn() }),
      pipeline: () => ({ exec: jest.fn() }),
      sadd: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
    } as any;

    const collector = new OptimizedRedditCollector({
      subreddits: ["test"],
      targetPostsPerRun: 1,
      maxConcurrency: 1,
      redisClient: mockRedis,
      credentials: [
        {
          userAgent: "ua",
          clientId: "id1",
          clientSecret: "sec1",
          username: "u1",
          password: "p1",
        },
        {
          userAgent: "ua",
          clientId: "id2",
          clientSecret: "sec2",
          username: "u2",
          password: "p2",
        },
        {
          userAgent: "ua",
          clientId: "id3",
          clientSecret: "sec3",
          username: "u3",
          password: "p3",
        },
      ],
    } as any);

    (collector as any).clients = [
      alwaysFailingClient,
      alwaysFailingClient,
      alwaysFailingClient,
    ];
    (collector as any).clientCooldownUntil = [0, 0, 0];

    const posts = await (collector as any).executeSamplingStrategy({
      subreddit: "test",
      sort: "new",
      limit: 1,
    });

    expect(posts).toHaveLength(0);
    expect((collector as any).clientCooldownUntil[0]).toBeGreaterThan(
      Date.now()
    );
    expect((collector as any).clientCooldownUntil[1]).toBeGreaterThan(
      Date.now()
    );
    expect((collector as any).clientCooldownUntil[2]).toBeGreaterThan(
      Date.now()
    );
  });

  /**
   * Checks that cooldown timestamps are persisted to Redis and respected
   * when selecting the next available client.
   */
  it("cooldown persistence via Redis: writes key and respects on next selection", async () => {
    const failingClient = {
      getSubreddit: () => ({
        getNew: jest.fn().mockRejectedValue(createRateLimitError()),
      }),
      config: jest.fn(),
    } as any;

    const healthyClient = {
      getSubreddit: () => ({
        getNew: jest.fn().mockResolvedValue([createMockSubmission("b1")]),
      }),
      config: jest.fn(),
    } as any;

    const mockRedis = {
      multi: () => ({ exec: jest.fn() }),
      pipeline: () => ({ exec: jest.fn() }),
      sadd: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
    } as any;

    const collector = new OptimizedRedditCollector({
      subreddits: ["test"],
      targetPostsPerRun: 1,
      maxConcurrency: 1,
      redisClient: mockRedis,
      credentials: [
        {
          userAgent: "ua",
          clientId: "id1",
          clientSecret: "sec1",
          username: "u1",
          password: "p1",
        },
        {
          userAgent: "ua",
          clientId: "id2",
          clientSecret: "sec2",
          username: "u2",
          password: "p2",
        },
      ],
    } as any);

    (collector as any).clients = [failingClient, healthyClient];
    (collector as any).clientIndex = 0;
    (collector as any).client = failingClient;
    (collector as any).clientCooldownUntil = [0, 0];

    await (collector as any).executeSamplingStrategy({
      subreddit: "test",
      sort: "new",
      limit: 1,
    });

    expect(mockRedis.set).toHaveBeenCalled();
    const [, value] = mockRedis.set.mock.calls[0];
    mockRedis.get.mockResolvedValueOnce(value);

    const nextClient = await (collector as any).nextClient();
    expect((collector as any).clientIndex).toBe(1);
    expect(nextClient).toBe(healthyClient);
  });

  /**
   * Ensures that concurrent strategy executions respect active cooldowns
   * and do not select clients that are currently cooling down.
   */
  it("parallel fetches: two strategies respect cooldown and do not select cooled client", async () => {
    const failingClient = {
      getSubreddit: () => ({
        getNew: jest.fn().mockRejectedValue(createRateLimitError()),
      }),
      config: jest.fn(),
    } as any;

    const healthyClient = {
      getSubreddit: () => ({
        getNew: jest.fn().mockResolvedValue([createMockSubmission("b1")]),
      }),
      config: jest.fn(),
    } as any;

    const mockRedis = {
      multi: () => ({ exec: jest.fn() }),
      pipeline: () => ({ exec: jest.fn() }),
      sadd: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
    } as any;

    const collector = new OptimizedRedditCollector({
      subreddits: ["test"],
      targetPostsPerRun: 2,
      maxConcurrency: 2,
      redisClient: mockRedis,
      credentials: [
        {
          userAgent: "ua",
          clientId: "id1",
          clientSecret: "sec1",
          username: "u1",
          password: "p1",
        },
        {
          userAgent: "ua",
          clientId: "id2",
          clientSecret: "sec2",
          username: "u2",
          password: "p2",
        },
      ],
    } as any);

    (collector as any).clients = [failingClient, healthyClient];
    (collector as any).clientIndex = 0;
    (collector as any).client = failingClient;
    (collector as any).clientCooldownUntil = [0, 0];

    const strategy = { subreddit: "test", sort: "new", limit: 1 } as any;
    const [posts1, posts2] = await Promise.all([
      (collector as any).executeSamplingStrategy(strategy),
      (collector as any).executeSamplingStrategy(strategy),
    ]);

    expect(posts1.length + posts2.length).toBeGreaterThan(0);
    expect((collector as any).clientIndex).toBe(1);
    expect((collector as any).clientCooldownUntil[0]).toBeGreaterThan(
      Date.now()
    );
  });
});
