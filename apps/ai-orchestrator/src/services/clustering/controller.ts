import { PostClusteringService } from "./clustering-service";
import {
  ExistingClusterState,
  IncrementalClusteringResult,
  PostForClustering,
} from "./types";

/**
 * Configuration options for initial clustering setup.
 */
interface InitialClusteringOptions {
  method?: "spectral" | "soft";
  minClusters?: number;
  maxClusters?: number;
  membershipThreshold?: number;
  coreThreshold?: number;
  minClusterSize?: number;
  mergeThreshold?: number;
}

/**
 * Configuration options for incremental clustering operations.
 */
interface IncrementalClusteringOptions {
  similarityThreshold?: number;
  newClusterThreshold?: number;
  maxClustersPerPost?: number;
  minNewClusterSize?: number;
  autoMerge?: boolean;
  mergeThreshold?: number;
}

/**
 * Extended return type that includes both incremental changes and updated state
 */
interface ProcessNewPostsResult {
  updatedState: ExistingClusterState;
  incrementalResult: IncrementalClusteringResult;
}

/**
 * Configuration for batch processing with periodic optimization.
 */
interface BatchProcessingOptions {
  optimizationThreshold?: number;
  minClusters?: number;
  maxClustersRatio?: number;
  membershipThreshold?: number;
  coreThreshold?: number;
  mergeThreshold?: number;
}

/**
 * Result of checking a single post for new cluster opportunities.
 */
interface NewClusterOpportunity {
  suggestedTitle: string;
  similarity: number;
  posts: PostForClustering[];
  potentialClusterId?: string;
}

/**
 * Extended result that includes opportunities for new cluster formation.
 */
interface SinglePostClusteringResult extends IncrementalClusteringResult {
  newClusterOpportunities?: NewClusterOpportunity[];
}

/**
 * Controller layer for managing post clustering workflows.
 * Handles initialization, incremental updates, streaming ingestion,
 * and batch processing with optimization.
 */
class PostClusteringController {
  constructor(private service: PostClusteringService) {}

  /**
   * Initialize clusters from a batch of existing posts.
   * Performs initial clustering and optional merge refinement.
   *
   * @param existingPosts - Array of posts to cluster
   * @param options - Configuration for clustering algorithm
   * @returns Cluster state ready for incremental updates
   */
  async setupInitialClusters(
    existingPosts: PostForClustering[],
    options: InitialClusteringOptions = {}
  ): Promise<ExistingClusterState> {
    const {
      method = "spectral",
      minClusters = 3,
      maxClusters = 10,
      membershipThreshold = 0.3,
      coreThreshold = 0.6,
      minClusterSize = 1,
      mergeThreshold = 0.7,
    } = options;

    const initialResult = await this.service.clusterPosts(existingPosts, {
      method,
      minClusters,
      maxClusters,
      membershipThreshold,
      coreThreshold,
      minClusterSize,
    });

    const refinedResult = await this.service.mergeHighlyOverlappingClusters(
      initialResult,
      existingPosts,
      mergeThreshold
    );

    const clusterState = await this.service.saveClusterState(
      refinedResult,
      existingPosts
    );

    return clusterState;
  }

  /**
   * Process a batch of new posts incrementally against existing cluster state.
   * Updates existing clusters and creates new ones as needed.
   *
   * @param newPosts - Array of new posts to process
   * @param state - Current cluster state
   * @param options - Configuration for incremental clustering
   * @returns Updated state and incremental changes
   */
  async processNewPosts(
    newPosts: PostForClustering[],
    state: ExistingClusterState,
    options: IncrementalClusteringOptions = {}
  ): Promise<ProcessNewPostsResult> {
    const {
      similarityThreshold = 0.5,
      newClusterThreshold = 0.65,
      maxClustersPerPost = 3,
      minNewClusterSize = 2,
      autoMerge = true,
      mergeThreshold = 0.8,
    } = options;

    const incrementalResult = await this.service.assignNewPostsToClusters(
      newPosts,
      state,
      {
        similarityThreshold,
        newClusterThreshold,
        maxClustersPerPost,
        minNewClusterSize,
        autoMerge,
        mergeThreshold,
      }
    );

    const updatedState: ExistingClusterState = {
      clusters: incrementalResult.updatedClusters,
      clusterEmbeddings: this.service["clusterCentroids"],
      posts: [...state.posts, ...newPosts],
      postEmbeddings: this.service["embeddingCache"],
      lastUpdated: new Date(),
    };

    return {
      updatedState,
      incrementalResult,
    };
  }

  /**
   * Check if a single post should form a new cluster with weakly-clustered posts.
   * Identifies opportunities for new cluster formation without committing changes.
   *
   * @param post - Single post to evaluate
   * @param state - Current cluster state
   * @param options - Configuration for similarity and candidate selection
   * @returns Clustering result with potential new cluster opportunities
   */
  async checkSinglePostForNewCluster(
    post: PostForClustering,
    state: ExistingClusterState,
    options: {
      similarityThreshold?: number;
      maxCandidates?: number;
      minNewClusterSize?: number;
    } = {}
  ): Promise<SinglePostClusteringResult> {
    const {
      similarityThreshold = 0.6,
      maxCandidates = 5,
      minNewClusterSize = 1,
    } = options;

    const opportunities = await this.service.findNewClusterOpportunities(
      post,
      state,
      {
        similarityThreshold,
        maxCandidates,
      }
    );

    let incrementalResult: IncrementalClusteringResult;

    if (opportunities.length === 0) {
      incrementalResult = await this.service.assignNewPostsToClusters(
        [post],
        state,
        { minNewClusterSize }
      );
    } else {
      incrementalResult = {
        updatedClusters: state.clusters,
        newClusters: [],
        modifiedClusters: [],
        assignments: [],
      };
    }

    return {
      ...incrementalResult,
      newClusterOpportunities: opportunities,
    };
  }

  /**
   * Process posts in streaming batches with continuous state updates.
   * Designed for real-time ingestion where posts arrive in waves.
   *
   * @param batches - Array of post batches to process sequentially
   * @param initialState - Starting cluster state
   * @param options - Configuration for incremental clustering
   * @returns Final cluster state after all batches processed
   */
  async streamNewPosts(
    batches: PostForClustering[][],
    initialState: ExistingClusterState,
    options: IncrementalClusteringOptions = {}
  ): Promise<ExistingClusterState> {
    const {
      similarityThreshold = 0.5,
      newClusterThreshold = 0.65,
      maxClustersPerPost = 2,
      minNewClusterSize = 2,
      autoMerge = false,
    } = options;

    let currentState = initialState;
    let allPosts = [...initialState.posts];

    for (const batch of batches) {
      const result = await this.service.assignNewPostsToClusters(
        batch,
        currentState,
        {
          similarityThreshold,
          newClusterThreshold,
          maxClustersPerPost,
          minNewClusterSize,
          autoMerge,
        }
      );

      allPosts.push(...batch);
      currentState = {
        clusters: result.updatedClusters,
        clusterEmbeddings: this.service["clusterCentroids"],
        posts: allPosts,
        postEmbeddings: this.service["embeddingCache"],
        lastUpdated: new Date(),
      };
    }

    return currentState;
  }

  /**
   * Process posts in batches with periodic full re-clustering optimization.
   * Balances incremental updates with periodic cleanup to maintain cluster quality.
   *
   * @param incomingPosts - Stream of posts to process
   * @param initialState - Starting cluster state
   * @param options - Configuration for batch processing and optimization
   * @returns Final optimized cluster state
   */
  async batchProcessWithOptimization(
    incomingPosts: PostForClustering[],
    initialState: ExistingClusterState,
    options: BatchProcessingOptions = {}
  ): Promise<ExistingClusterState> {
    const {
      optimizationThreshold = 10,
      minClusters = 3,
      maxClustersRatio = 3,
      membershipThreshold = 0.3,
      coreThreshold = 0.6,
      mergeThreshold = 0.75,
    } = options;

    let currentState = initialState;
    let newPostsCount = 0;
    let allPosts = [...initialState.posts];

    for (const post of incomingPosts) {
      const result = await this.service.assignNewPostsToClusters(
        [post],
        currentState,
        {
          similarityThreshold: 0.5,
          newClusterThreshold: 0.7,
          minNewClusterSize: 1,
        }
      );

      allPosts.push(post);
      currentState = {
        clusters: result.updatedClusters,
        clusterEmbeddings: this.service["clusterCentroids"],
        posts: allPosts,
        postEmbeddings: this.service["embeddingCache"],
        lastUpdated: new Date(),
      };
      newPostsCount++;

      if (newPostsCount >= optimizationThreshold) {
        currentState = await this.optimizeClusters(
          allPosts,
          minClusters,
          maxClustersRatio,
          membershipThreshold,
          coreThreshold,
          mergeThreshold
        );
        newPostsCount = 0;
      }
    }

    if (newPostsCount > 0) {
      currentState = await this.optimizeClusters(
        allPosts,
        minClusters,
        maxClustersRatio,
        membershipThreshold,
        coreThreshold,
        mergeThreshold
      );
    }

    return currentState;
  }

  /**
   * Handle a post with multiple strong topic affiliations.
   * Allows assignment to multiple clusters with detailed membership analysis.
   *
   * @param post - Post potentially spanning multiple topics
   * @param state - Current cluster state
   * @param options - Configuration allowing multiple cluster memberships
   * @returns Clustering result with multi-cluster assignments
   */
  async handleMultiTopicPost(
    post: PostForClustering,
    state: ExistingClusterState,
    options: {
      similarityThreshold?: number;
      maxClustersPerPost?: number;
      newClusterThreshold?: number;
      minNewClusterSize?: number;
    } = {}
  ): Promise<IncrementalClusteringResult> {
    const {
      similarityThreshold = 0.4,
      maxClustersPerPost = 5,
      newClusterThreshold = 0.7,
      minNewClusterSize = 1,
    } = options;

    const result = await this.service.assignNewPostsToClusters([post], state, {
      similarityThreshold,
      maxClustersPerPost,
      newClusterThreshold,
      minNewClusterSize,
    });

    return result;
  }

  /**
   * Internal helper: Re-cluster all posts for optimization.
   * Runs full clustering algorithm to improve cluster quality.
   */
  private async optimizeClusters(
    allPosts: PostForClustering[],
    minClusters: number,
    maxClustersRatio: number,
    membershipThreshold: number,
    coreThreshold: number,
    mergeThreshold: number
  ): Promise<ExistingClusterState> {
    const reClusteredResult = await this.service.clusterPosts(allPosts, {
      method: "soft",
      minClusters: Math.max(minClusters, Math.floor(allPosts.length / 10)),
      maxClusters: Math.ceil(allPosts.length / maxClustersRatio),
      membershipThreshold,
      coreThreshold,
    });

    const optimizedResult = await this.service.mergeHighlyOverlappingClusters(
      reClusteredResult,
      allPosts,
      mergeThreshold
    );

    const optimizedState = await this.service.saveClusterState(
      optimizedResult,
      allPosts
    );

    return optimizedState;
  }

  /**
   * Export cluster state results in markdown format for reporting/persistence.
   *
   * @param state - Current cluster state to export
   * @returns Formatted markdown string with clustering details
   */
  exportResults(state: ExistingClusterState): string {
    let output = "# Clustering Results\n\n";

    // Summary statistics
    const totalPosts = state.posts.length;
    const totalClusters = state.clusters.length;
    const problemClusters = state.clusters.filter(
      (c) => c.type === "problem"
    ).length;
    const solutionClusters = state.clusters.filter(
      (c) => c.type === "solution"
    ).length;
    const mixedClusters = state.clusters.filter(
      (c) => c.type === "mixed"
    ).length;

    // Calculate posts in clusters vs unclustered
    const clusteredPostIds = new Set<string>();
    state.clusters.forEach((cluster) => {
      cluster.members.forEach((member) => {
        clusteredPostIds.add(member.id);
      });
    });
    const unclusteredPosts = state.posts.filter(
      (post) => !clusteredPostIds.has(post.id)
    );

    // Calculate multi-cluster membership
    const postClusterCounts = new Map<string, number>();
    state.clusters.forEach((cluster) => {
      cluster.members.forEach((member) => {
        postClusterCounts.set(
          member.id,
          (postClusterCounts.get(member.id) || 0) + 1
        );
      });
    });
    const postsInMultipleClusters = Array.from(
      postClusterCounts.values()
    ).filter((count) => count > 1).length;

    const avgMembershipsPerPost =
      totalPosts > 0
        ? Array.from(postClusterCounts.values()).reduce(
            (sum, count) => sum + count,
            0
          ) / totalPosts
        : 0;

    // Summary section
    output += "## Summary\n";
    output += `- Total posts: ${totalPosts}\n`;
    output += `- Total clusters: ${totalClusters}\n`;
    output += `- Problem clusters: ${problemClusters}\n`;
    output += `- Solution clusters: ${solutionClusters}\n`;
    output += `- Mixed clusters: ${mixedClusters}\n`;
    output += `- Unclustered posts: ${unclusteredPosts.length}\n`;
    output += `- Posts in multiple clusters: ${postsInMultipleClusters}\n`;
    output += `- Average memberships per post: ${avgMembershipsPerPost.toFixed(
      2
    )}\n`;
    output += `- Last updated: ${state.lastUpdated.toISOString()}\n\n`;

    // Clusters section
    output += "## Clusters\n\n";

    for (const cluster of state.clusters) {
      output += `### ${cluster.title}\n`;
      output += `**ID:** ${cluster.id}\n`;
      output += `**Type:** ${cluster.type}\n`;
      output += `**Members:** ${cluster.members.length} posts (${cluster.core_members.length} core, ${cluster.peripheral_members.length} peripheral)\n`;
      output += `**Member IDs:** ${cluster.members
        .map((m) => `${m.id} (${(m.membership_strength * 100).toFixed(0)}%)`)
        .join(", ")}\n`;
      output += `**Representative:** ${cluster.representative.id} (idx: ${cluster.representative.idx})\n`;
      output += `**Keywords:** ${cluster.keywords.join(", ")}\n`;
      output += `**Description:** ${cluster.description}\n`;
      output += `**Cohesion:** ${(cluster.cluster_cohesion * 100).toFixed(
        1
      )}%\n`;
      output += `**Aggregated Confidence:** ${cluster.aggregated_confidence.toFixed(
        3
      )}\n`;

      if (cluster.sub_clusters) {
        if (
          cluster.sub_clusters.problem &&
          cluster.sub_clusters.problem.length > 0
        ) {
          output += `**Problem posts:** ${cluster.sub_clusters.problem.join(
            ", "
          )}\n`;
        }
        if (
          cluster.sub_clusters.solution &&
          cluster.sub_clusters.solution.length > 0
        ) {
          output += `**Solution posts:** ${cluster.sub_clusters.solution.join(
            ", "
          )}\n`;
        }
      }

      output += "\n";
    }

    // Unclustered posts section
    if (unclusteredPosts.length > 0) {
      output += "## Unclustered Posts\n";
      for (const post of unclusteredPosts) {
        output += `- ${post.id} (idx: ${post.idx}): ${post.body.substring(
          0,
          100
        )}...\n`;
      }
      output += "\n";
    }

    // Multi-cluster posts section
    if (postsInMultipleClusters > 0) {
      output += "## Posts in Multiple Clusters\n";
      const multiClusterPosts = state.posts.filter(
        (post) => (postClusterCounts.get(post.id) || 0) > 1
      );

      for (const post of multiClusterPosts) {
        const clusterCount = postClusterCounts.get(post.id) || 0;
        const postClusters = state.clusters
          .filter((c) => c.members.some((m) => m.id === post.id))
          .map((c) => {
            const membership = c.members.find((m) => m.id === post.id);
            return `${c.id} (${(membership!.membership_strength * 100).toFixed(
              0
            )}%)`;
          });

        output += `- ${post.id} (idx: ${
          post.idx
        }) in ${clusterCount} clusters: ${postClusters.join(", ")}\n`;
        output += `  "${post.body.substring(0, 80)}..."\n`;
      }
    }

    return output;
  }

  /**
   * Export incremental clustering results in markdown format.
   *
   * @param result - Incremental clustering result
   * @param newPosts - Posts that were processed
   * @returns Formatted markdown string
   */
  exportIncrementalResults(
    result: IncrementalClusteringResult,
    newPosts: PostForClustering[]
  ): string {
    let output = "# Incremental Clustering Results\n\n";

    // Summary
    output += "## Summary\n";
    output += `- New posts processed: ${newPosts.length}\n`;
    output += `- Modified clusters: ${result.modifiedClusters.length}\n`;
    output += `- New clusters created: ${result.newClusters.length}\n`;
    output += `- Total clusters: ${result.updatedClusters.length}\n\n`;

    // Post assignments
    output += "## Post Assignments\n\n";
    for (const assignment of result.assignments) {
      const post = newPosts.find((p) => p.id === assignment.postId);
      if (post) {
        output += `### ${post.id}\n`;
        output += `**Content:** "${post.body.substring(0, 100)}..."\n`;
        output += `**Assigned to ${assignment.clusters.length} cluster(s):**\n`;

        for (const cluster of assignment.clusters) {
          const clusterObj = result.updatedClusters.find(
            (c) => c.id === cluster.clusterId
          );
          output += `- ${cluster.clusterId}${cluster.isNew ? " [NEW]" : ""}: "${
            clusterObj?.title
          }" (${(cluster.membershipStrength * 100).toFixed(1)}%)\n`;
        }
        output += "\n";
      }
    }

    // New clusters
    if (result.newClusters.length > 0) {
      output += "## New Clusters Created\n\n";
      for (const cluster of result.newClusters) {
        output += `### ${cluster.title}\n`;
        output += `**ID:** ${cluster.id}\n`;
        output += `**Type:** ${cluster.type}\n`;
        output += `**Members:** ${cluster.members.length}\n`;
        output += `**Keywords:** ${cluster.keywords.join(", ")}\n`;
        output += `**Description:** ${cluster.description}\n\n`;
      }
    }

    // Suggested merges
    if (result.suggestedMerges && result.suggestedMerges.length > 0) {
      output += "## Suggested Cluster Merges\n\n";
      for (const merge of result.suggestedMerges) {
        const cluster1 = result.updatedClusters.find(
          (c) => c.id === merge.cluster1
        );
        const cluster2 = result.updatedClusters.find(
          (c) => c.id === merge.cluster2
        );
        output += `- **${merge.cluster1}** ("${cluster1?.title}") ↔ **${merge.cluster2}** ("${cluster2?.title}")\n`;
        output += `  Similarity: ${(merge.similarity * 100).toFixed(1)}%\n\n`;
      }
    }

    return output;
  }
}

export { PostClusteringController };
