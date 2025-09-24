import "dotenv/config";
import { supabase } from "../src/lib/supabase";
import { logger } from "../src/lib/logger";

async function calculateTrends() {
  logger.info("Starting trend calculation...");
  
  try {
    // Calculate trends for the last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const { data: clusters, error } = await supabase
      .from("clusters")
      .select("id, name, category_id")
      .gt("member_count", 0);

    if (error) throw error;

    for (const cluster of clusters || []) {
      logger.info(`Calculating trends for cluster ${cluster.id}: ${cluster.name}`);

      // Get current period mentions
      const { data: currentMentions, error: currentError } = await supabase
        .from("mentions")
        .select("*")
        .eq("cluster_id", cluster.id)
        .gte("mentioned_at", startDate.toISOString())
        .lte("mentioned_at", endDate.toISOString());

      if (currentError) throw currentError;

      // Get previous period mentions for comparison
      const prevEndDate = new Date(startDate);
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);

      const { data: prevMentions, error: prevError } = await supabase
        .from("mentions")
        .select("*")
        .eq("cluster_id", cluster.id)
        .gte("mentioned_at", prevStartDate.toISOString())
        .lte("mentioned_at", prevEndDate.toISOString());

      if (prevError) throw prevError;

      const currentCount = currentMentions?.length || 0;
      const prevCount = prevMentions?.length || 0;

      const growthRate = prevCount > 0 
        ? ((currentCount - prevCount) / prevCount) * 100 
        : currentCount > 0 ? 100 : 0;

      const avgSentiment = currentMentions?.length 
        ? (currentMentions.reduce((sum, m) => sum + (m.sentiment_score || 0), 0) / currentMentions.length)
        : 0;

      // Calculate trend score (simple formula, can be improved)
      const trendScore = Math.max(0, growthRate + (avgSentiment * 10));

      // Insert or update trend record
      const { error: trendError } = await supabase
        .from("trends")
        .upsert({
          cluster_id: cluster.id,
          category_id: cluster.category_id,
          period_start: startDate.toISOString(),
          period_end: endDate.toISOString(),
          mention_count: currentCount,
          growth_rate: growthRate,
          trend_score: trendScore,
          avg_sentiment: avgSentiment,
          calculated_at: new Date().toISOString(),
        }, {
          onConflict: "cluster_id,period_start,period_end"
        });

      if (trendError) throw trendError;

      logger.info(`Cluster ${cluster.id}: ${currentCount} mentions, ${growthRate.toFixed(2)}% growth, trend score: ${trendScore.toFixed(2)}`);
    }

    logger.info("Trend calculation completed successfully");
  } catch (error) {
    logger.error("Error calculating trends:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  calculateTrends().then(() => process.exit(0));
}