import { Router } from "express";
import { supabase } from "@/lib/supabase";
import { PostsRepository } from "@/repositories/posts.repository";
import { ClustersRepository } from "@/repositories/clusters.repository";
import { EnhancedClusteringService } from "@/services/enhanced-clustering.service";
import { PostForClustering, ClusteringResult } from "@/types";
import { logger } from "@/lib/logger";

const router = Router();

/**
 * POST /api/clustering/cluster-posts
 * Clusters posts using the enhanced semantic clustering algorithm
 */
router.post("/cluster-posts", async (req, res) => {
  try {
    const { posts }: { posts: PostForClustering[] } = req.body;

    if (!Array.isArray(posts)) {
      return res.status(400).json({
        error: "Posts array is required",
      });
    }

    // Initialize services
    const clusteringService = new EnhancedClusteringService(supabase);

    // Perform clustering
    const result: ClusteringResult = await clusteringService.clusterPosts(posts);

    res.json(result);
  } catch (error) {
    logger.error("Error in cluster-posts endpoint:", { error });
    res.status(500).json({
      error: "Failed to cluster posts",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/clustering/cluster-from-db
 * Clusters posts from database based on filters
 */
router.post("/cluster-from-db", async (req, res) => {
  try {
    const {
      filters = {},
      limit = 1000,
    } = req.body;

    // Initialize services
    const postsRepo = new PostsRepository(supabase);
    const clusteringService = new EnhancedClusteringService(supabase);

    // Fetch posts from database
    const rawPosts = await postsRepo.findMany(
      {
        status: "processed",
        ...filters,
      },
      [
        "id",
        "source",
        "body",
        "keywords",
        "category_id",
        "classification",
        "classification_confidence",
        "created_at",
        "embedding"
      ],
      limit
    );

    // Convert to clustering format
    const posts: PostForClustering[] = rawPosts.map((post, idx) => ({
      idx,
      id: post.id,
      source: post.source,
      body: post.body,
      keywords: post.keywords || [],
      category_id: post.category_id,
      classification: post.classification || "other",
      classification_confidence: post.classification_confidence || 0,
      created_at: post.created_at || undefined,
      embedding: post.embedding ? JSON.parse(post.embedding as string) : undefined,
    }));

    logger.info(`[Clustering API] Clustering ${posts.length} posts from database`);

    // Perform clustering
    const result: ClusteringResult = await clusteringService.clusterPosts(posts);

    res.json(result);
  } catch (error) {
    logger.error("Error in cluster-from-db endpoint:", { error });
    res.status(500).json({
      error: "Failed to cluster posts from database",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/clustering/clusters
 * Get all existing clusters with enhanced metadata
 */
router.get("/clusters", async (req, res) => {
  try {
    const clustersRepo = new ClustersRepository(supabase);

    const clusters = await clustersRepo.findAll();

    res.json({ clusters });
  } catch (error) {
    logger.error("Error fetching clusters:", { error });
    res.status(500).json({
      error: "Failed to fetch clusters",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/clustering/clusters/:id/posts
 * Get all posts in a specific cluster
 */
router.get("/clusters/:id/posts", async (req, res) => {
  try {
    const clusterId = parseInt(req.params.id);
    if (isNaN(clusterId)) {
      return res.status(400).json({ error: "Invalid cluster ID" });
    }

    const postsRepo = new PostsRepository(supabase);

    const posts = await postsRepo.findMany(
      { cluster_id: clusterId },
      ["id", "body", "source", "url", "created_at", "classification"]
    );

    res.json({ posts });
  } catch (error) {
    logger.error("Error fetching cluster posts:", { error });
    res.status(500).json({
      error: "Failed to fetch cluster posts",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/clustering/recompute-centroids
 * Recompute centroids for all clusters
 */
router.post("/recompute-centroids", async (req, res) => {
  try {
    const clustersRepo = new ClustersRepository(supabase);

    const clusters = await clustersRepo.findAll();

    for (const cluster of clusters) {
      await clustersRepo.recomputeCentroid(cluster.id);
    }

    res.json({
      message: `Recomputed centroids for ${clusters.length} clusters`,
      count: clusters.length,
    });
  } catch (error) {
    logger.error("Error recomputing centroids:", { error });
    res.status(500).json({
      error: "Failed to recompute centroids",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;