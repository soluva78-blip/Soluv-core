import { config } from "@/config";
import { redditClient } from "@/lib/redditClient";
import { Post } from "@/models/posts";
import { RedditService } from "@/services/reddit.service";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

jest.setTimeout(60000);

describe("Reddit ingestion pipeline", () => {
  let mongoServer: MongoMemoryServer | null = null;
  let service: RedditService;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: "7.0.3" }, // stable version to avoid redownloads
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    service = new RedditService(redditClient);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Post.deleteMany({});
  });

  it("should fetch and store posts in MongoDB", async () => {
    const start = Date.now();

    const posts = await service.run(
      config.redditFetchConfig.subreddits,
      "problem"
    );

    await Post.insertMany(posts);

    const count = await Post.countDocuments();
    const duration = (Date.now() - start) / 1000;

    console.log(`⏱️ Took ${duration.toFixed(2)}s`);
    console.log(`📦 Inserted ${count} posts`);

    expect(count).toBeGreaterThan(0);
  });
});
