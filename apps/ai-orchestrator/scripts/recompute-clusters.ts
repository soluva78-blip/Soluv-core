import "dotenv/config";
import { supabase } from "../src/lib/supabase";
import { logger } from "../src/lib/logger";
import { embeddingsService } from "../src/utils/embeddings";

async function recomputeClusters() {
  logger.info("Starting cluster recomputation...");
  
  try {
    const { data: clusters, error } = await supabase
      .from("clusters")
      .select("*")
      .gt("member_count", 1);

    if (error) throw error;

    for (const cluster of clusters || []) {
      logger.info(`Recomputing cluster ${cluster.id}: ${cluster.name}`);

      // Get all posts in this cluster
      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("embedding")
        .eq("cluster_id", cluster.id)
        .not("embedding", "is", null);

      if (postsError) throw postsError;

      if (!posts || posts.length === 0) {
        logger.warn(`No posts found for cluster ${cluster.id}`);
        continue;
      }

      // Extract embeddings
      const embeddings = posts.map(p => p.embedding);

      // Calculate new centroid
      const newCentroid = embeddingsService.calculateCentroid(embeddings);

      // Update cluster centroid and member count
      const { error: updateError } = await supabase
        .from("clusters")
        .update({
          centroid: newCentroid,
          member_count: embeddings.length,
          last_recomputed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", cluster.id);

      if (updateError) throw updateError;

      logger.info(`Updated cluster ${cluster.id} with ${embeddings.length} members`);
    }

    logger.info("Cluster recomputation completed successfully");
  } catch (error) {
    logger.error("Error recomputing clusters:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  recomputeClusters().then(() => process.exit(0));
}