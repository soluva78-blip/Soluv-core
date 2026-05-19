import {
  ClusteringResult,
  IncrementalClusteringResult,
  PostForClustering,
} from "../types";

export class ExportUtils {
  exportResults(result: ClusteringResult, posts: PostForClustering[]): string {
    let output = "# Clustering Results (Overlapping Clusters)\n\n";

    // Summary
    output += "## Summary\n";
    output += `- Total posts: ${result.summary.total_posts}\n`;
    output += `- Total clusters: ${result.summary.total_clusters}\n`;
    output += `- Problem clusters: ${result.summary.problem_clusters}\n`;
    output += `- Solution clusters: ${result.summary.solution_clusters}\n`;
    output += `- Mixed clusters: ${result.summary.mixed_clusters}\n`;
    output += `- Posts in multiple clusters: ${result.summary.posts_in_multiple_clusters}\n`;
    output += `- Average cluster memberships per post: ${result.summary.avg_memberships_per_post}\n`;
    output += `- Unclustered posts: ${result.unclustered.length}\n\n`;

    // Clusters
    output += "## Clusters\n\n";

    for (const cluster of result.clusters) {
      output += `### ${cluster.title}\n`;
      output += `**Type:** ${cluster.type}\n`;
      output += `**Total Members:** ${cluster.members.length} posts\n`;
      output += `**Core Members:** ${cluster.core_members.length} posts\n`;
      output += `**Peripheral Members:** ${cluster.peripheral_members.length} posts\n`;
      output += `**Cluster Cohesion:** ${cluster.cluster_cohesion}\n`;
      output += `**Representative:** ${cluster.representative.id} (idx: ${cluster.representative.idx})\n`;
      output += `**Keywords:** ${cluster.keywords.join(", ")}\n`;
      output += `**Description:** ${cluster.description}\n`;
      output += `**Aggregated Confidence:** ${cluster.aggregated_confidence}\n`;

      // Show core members with membership strength
      if (cluster.core_members.length > 0) {
        output += `**Core Members (with membership strength):**\n`;
        cluster.core_members.forEach((m) => {
          output += `  - ${m.id} (strength: ${(
            m.membership_strength * 100
          ).toFixed(1)}%)\n`;
        });
      }

      // Show peripheral members
      if (cluster.peripheral_members.length > 0) {
        output += `**Peripheral Members (with membership strength):**\n`;
        cluster.peripheral_members.forEach((m) => {
          output += `  - ${m.id} (strength: ${(
            m.membership_strength * 100
          ).toFixed(1)}%)\n`;
        });
      }

      if (cluster.sub_clusters) {
        if (cluster.sub_clusters.problem) {
          output += `**Problem posts:** ${cluster.sub_clusters.problem.join(
            ", "
          )}\n`;
        }
        if (cluster.sub_clusters.solution) {
          output += `**Solution posts:** ${cluster.sub_clusters.solution.join(
            ", "
          )}\n`;
        }
      }

      output += "\n";
    }

    // Post-Cluster Membership Matrix
    output += "## Post-Cluster Memberships\n\n";
    output += "Posts that belong to multiple clusters:\n\n";

    for (const [postIdx, clusterIds] of result.post_cluster_matrix) {
      if (clusterIds.size > 1) {
        const post = posts[postIdx];
        output += `- **${post.id}** (idx: ${postIdx}): belongs to ${Array.from(
          clusterIds
        ).join(", ")}\n`;
        output += `  "${post.body.substring(0, 100)}..."\n`;
      }
    }

    // Unclustered
    if (result.unclustered.length > 0) {
      output += "\n## Unclustered Posts\n";
      for (const idx of result.unclustered) {
        const post = posts[idx];
        output += `- ${post.id} (idx: ${idx}): ${post.body.substring(
          0,
          100
        )}...\n`;
      }
    }

    return output;
  }

  exportIncrementalResults(
    result: IncrementalClusteringResult,
    newPosts: PostForClustering[]
  ): string {
    let output = "# Incremental Clustering Results\n\n";

    // Summary
    output += "## Summary\n";
    output += `- New posts processed: ${newPosts.length}\n`;
    output += `- Modified existing clusters: ${result.modifiedClusters.length}\n`;
    output += `- New clusters created: ${result.newClusters.length}\n`;
    output += `- Total clusters: ${result.updatedClusters.length}\n\n`;

    // Post Assignments
    output += "## Post Assignments\n\n";
    for (const assignment of result.assignments) {
      const post = newPosts.find((p) => p.id === assignment.postId);
      if (post) {
        output += `### ${post.id}\n`;
        output += `"${post.body.substring(0, 100)}..."\n\n`;
        output += "**Assigned to:**\n";

        for (const cluster of assignment.clusters) {
          const clusterObj = result.updatedClusters.find(
            (c) => c.id === cluster.clusterId
          );
          output += `- ${cluster.clusterId}: "${clusterObj?.title}" `;
          output += `(strength: ${(cluster.membershipStrength * 100).toFixed(
            1
          )}%`;
          output += cluster.isNew ? ", NEW CLUSTER)\n" : ")\n";
        }
        output += "\n";
      }
    }

    // New Clusters
    if (result.newClusters.length > 0) {
      output += "## New Clusters Created\n\n";
      for (const cluster of result.newClusters) {
        output += `### ${cluster.id}: ${cluster.title}\n`;
        output += `**Type:** ${cluster.type}\n`;
        output += `**Members:** ${cluster.members.length}\n`;
        output += `**Description:** ${cluster.description}\n`;
        output += `**Keywords:** ${cluster.keywords.join(", ")}\n`;
        output += `**Cohesion:** ${cluster.cluster_cohesion.toFixed(3)}\n\n`;
      }
    }

    // Modified Clusters
    if (result.modifiedClusters.length > 0) {
      output += "## Modified Existing Clusters\n\n";
      for (const clusterId of result.modifiedClusters) {
        const cluster = result.updatedClusters.find((c) => c.id === clusterId);
        if (cluster) {
          output += `- **${clusterId}:** "${cluster.title}" - `;
          output += `Now has ${cluster.members.length} members\n`;
        }
      }
      output += "\n";
    }

    // Suggested Merges
    if (result.suggestedMerges && result.suggestedMerges.length > 0) {
      output += "## Suggested Cluster Merges\n\n";
      for (const merge of result.suggestedMerges) {
        const c1 = result.updatedClusters.find((c) => c.id === merge.cluster1);
        const c2 = result.updatedClusters.find((c) => c.id === merge.cluster2);
        output += `- **${merge.cluster1}** ("${c1?.title}") <-> `;
        output += `**${merge.cluster2}** ("${c2?.title}") `;
        output += `(similarity: ${(merge.similarity * 100).toFixed(1)}%)\n`;
      }
    }

    return output;
  }
}
