import { config } from "@/config";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { addPostToQueue, getQueueStatus } from "@/queues/orchestrator.queue";
import { OrchestratorService } from "@/services/orchestrator.service";
import { ProcessPostRequest, RawPost } from "@/types";
import cors from "cors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.app.environment,
  });
});

// Process post endpoint
app.post("/api/process-post", async (req, res) => {
  try {
    const { post }: ProcessPostRequest = req.body;

    if (!post || !post.id || !post.title || !post.body) {
      return res.status(400).json({
        error: "Invalid post data. Required: id, title, body",
        received: Object.keys(post || {}),
      });
    }

    // Validate post structure
    const rawPost: RawPost = {
      id: post.id,
      title: post.title,
      body: post.body,
      author: post.author || { name: "Unknown" },
      score: post.score || 0,
      url: post.url || "",
      numComments: post.numComments,
      subreddit: post.subreddit,
      permalink: post.permalink,
      createdUtc: post.createdUtc,
      isNsfw: post.isNsfw,
      metadata: post.metadata,
    };

    // Add to queue
    await addPostToQueue(rawPost);

    logger.info(`Post ${rawPost.id} added to processing queue`);

    res.json({
      success: true,
      message: `Post ${rawPost.id} queued for processing`,
      postId: rawPost.id,
    });
  } catch (error: any) {
    logger.error("Error processing post:", { error });
    res.status(500).json({
      error: "Failed to process post",
      message: (error as Error).message,
    });
  }
});

// Process post directly (synchronous)
app.post("/api/process-post-sync", async (req, res) => {
  try {
    const { post }: ProcessPostRequest = req.body;

    if (!post || !post.id || !post.title || !post.body) {
      return res.status(400).json({
        error: "Invalid post data. Required: id, title, body",
      });
    }

    const rawPost: RawPost = {
      id: post.id,
      title: post.title,
      body: post.body,
      author: post.author || { name: "Unknown" },
      score: post.score || 0,
      url: post.url || "",
      numComments: post.numComments,
      subreddit: post.subreddit,
      permalink: post.permalink,
      createdUtc: post.createdUtc,
      isNsfw: post.isNsfw,
      metadata: post.metadata,
    };

    // Process directly
    const orchestrator = new OrchestratorService(supabase);
    await orchestrator.processPost(rawPost);

    logger.info(`Post ${rawPost.id} processed successfully`);

    res.json({
      success: true,
      message: `Post ${rawPost.id} processed successfully`,
      postId: rawPost.id,
    });
  } catch (error: any) {
    logger.error("Error processing post synchronously:", { error });
    res.status(500).json({
      error: "Failed to process post",
      message: (error as Error).message,
    });
  }
});

// Queue status endpoint
app.get("/api/queue/status", async (req, res) => {
  try {
    const status = await getQueueStatus();
    res.json(status);
  } catch (error: any) {
    logger.error("Error getting queue status:", { error });
    res.status(500).json({
      error: "Failed to get queue status",
      message: (error as Error).message,
    });
  }
});

// Error handling
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error:", error);
    res.status(500).json({
      error: "Internal server error",
      message:
        config.app.environment === "development"
          ? error.message
          : "Something went wrong",
    });
  }
);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

const port = config.app.port;

app.listen(port, () => {
  logger.info(`🚀 AI Orchestrator API server running on port ${port}`);
  logger.info(`Environment: ${config.app.environment}`);
  logger.info(`Available endpoints:`);
  logger.info(`  GET  /health - Health check`);
  logger.info(`  POST /api/process-post - Queue post for processing`);
  logger.info(`  POST /api/process-post-sync - Process post synchronously`);
  logger.info(`  GET  /api/queue/status - Get queue status`);
});
