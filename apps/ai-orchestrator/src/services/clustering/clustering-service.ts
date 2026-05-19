import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { ClusterMetadataService } from "./cluster-analysis/cluster-metadata";
import { SoftClustering } from "./clustering-algorithms/soft-clustering";
import { SpectralClustering } from "./clustering-algorithms/spectral-clustering";
import { IncrementalClusteringService } from "./incremental-clustering";
import {
  Cluster,
  ClusteringResult,
  ClusterMembership,
  ExistingClusterState,
  IncrementalClusteringResult,
  PostForClustering,
} from "./types";
import { ExportUtils } from "./utils/export-utils";
import { EmbeddingService } from "./utils/generate-embedding";
import { MathUtils } from "./utils/math-utils";

/**
 * Service responsible for clustering posts based on semantic similarity.
 * Supports both soft and spectral clustering methods with overlapping clusters.
 * Provides cluster analysis, metadata generation, and post-to-cluster mapping.
 */
export class PostClusteringService {
  private llm: ChatOpenAI;
  private exportUtils: ExportUtils;
  private embeddings: OpenAIEmbeddings;
  private embeddingService: EmbeddingService;
  private metadataService: ClusterMetadataService;
  private incrementalService: IncrementalClusteringService;
  private embeddingCache: Map<string, number[]> = new Map();
  private clusterCentroids: Map<string, number[]> = new Map();

  /**
   * Creates a new instance of PostClusteringService.
   * @param openAIApiKey - The OpenAI API key used for embeddings and LLM calls.
   */
  constructor(openAIApiKey: string) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: "text-embedding-3-small",
    });

    this.llm = new ChatOpenAI({
      openAIApiKey,
      modelName: "gpt-4-turbo-preview",
      temperature: 0.2,
    });

    this.exportUtils = new ExportUtils();
    this.metadataService = new ClusterMetadataService(this.llm);
    this.embeddingService = new EmbeddingService(
      this.embeddings,
      this.embeddingCache
    );
    this.incrementalService = new IncrementalClusteringService(
      this.metadataService,
      this.embeddingService,
      this.embeddingCache,
      this.clusterCentroids
    );
  }

  /**
   * Saves the current clustering result as a persistent state.
   * Calculates and stores cluster centroids for future reference.
   * @param result - The clustering result to persist.
   * @param posts - The original posts that were clustered.
   * @returns A complete cluster state including embeddings and metadata.
   */
  async saveClusterState(
    result: ClusteringResult,
    posts: PostForClustering[]
  ): Promise<ExistingClusterState> {
    const clusterEmbeddings = new Map<string, number[]>();

    // Calculate and store cluster centroids
    for (const cluster of result.clusters) {
      const memberEmbeddings = cluster.members.map((m) => {
        const embedding = this.embeddingCache.get(posts[m.idx].id);
        if (!embedding)
          throw new Error(`No embedding found for post ${posts[m.idx].id}`);
        return { embedding, weight: m.membership_strength };
      });

      const centroid = MathUtils.calculateWeightedCentroid(memberEmbeddings);
      clusterEmbeddings.set(cluster.id, centroid);
      this.clusterCentroids.set(cluster.id, centroid);
    }

    return {
      clusters: result.clusters,
      clusterEmbeddings,
      posts,
      postEmbeddings: new Map(this.embeddingCache),
      lastUpdated: new Date(),
    };
  }

  /**
   * Clusters posts based on semantic similarity using embeddings.
   * Supports soft clustering (fuzzy) and spectral clustering with overlap.
   * @param posts - Array of posts to cluster.
   * @param options - Clustering configuration options.
   * @returns Clustering result with clusters, metadata, and statistics.
   */
  async clusterPosts(
    posts: PostForClustering[],
    options: {
      method?: "soft" | "spectral";
      minClusters?: number;
      maxClusters?: number;
      membershipThreshold?: number;
      coreThreshold?: number;
      overlapThreshold?: number;
      minClusterSize?: number;
      debugMode?: boolean;
    } = {}
  ): Promise<ClusteringResult> {
    const {
      method = "soft",
      minClusters = 3,
      maxClusters = Math.ceil(posts.length / 3),
      membershipThreshold = 0.3,
      coreThreshold = 0.6,
      overlapThreshold = 0.4,
      minClusterSize = 1,
      debugMode = false,
    } = options;

    console.log("Starting overlapping clustering with options:", {
      method,
      minClusters,
      maxClusters,
      membershipThreshold,
      coreThreshold,
      minClusterSize,
    });
    console.log("Processing", posts.length, "posts...");

    // Generate embeddings
    const embeddings = await this.embeddingService.generateEmbeddings(posts);

    console.log("Creating similarity matrix...");
    const similarityMatrix = MathUtils.createSimilarityMatrix(embeddings);

    // Debug output
    if (debugMode) {
      MathUtils.debugSimilarities(similarityMatrix, posts);
    }

    // Perform clustering based on method
    let clusterMemberships:
      | Map<number, Map<number, number>>
      | Map<number, Set<number>>;

    if (method === "soft") {
      console.log("Performing soft clustering...");
      clusterMemberships = SoftClustering.performSoftClustering(
        embeddings,
        similarityMatrix,
        {
          minClusters,
          maxClusters,
          membershipThreshold,
          coreThreshold,
        }
      );
    } else {
      console.log("Performing spectral clustering with overlap...");
      const spectralResult =
        SpectralClustering.performSpectralClusteringWithOverlap(
          similarityMatrix,
          Math.min(
            maxClusters,
            Math.max(minClusters, Math.floor(posts.length / 5))
          ),
          overlapThreshold
        );

      // Convert to membership format
      clusterMemberships = new Map();
      for (const [postIdx, clusters] of spectralResult) {
        const membershipMap = new Map<number, number>();
        for (const clusterId of clusters) {
          membershipMap.set(clusterId, 1.0 / clusters.size); // Equal membership
        }
        (clusterMemberships as Map<number, Map<number, number>>).set(
          postIdx,
          membershipMap
        );
      }
    }

    // Build clusters from memberships
    const clusters: Cluster[] = [];
    const clusterIndicesMap = new Map<number, ClusterMembership[]>();
    const postClusterMatrix = new Map<number, Set<string>>();

    // Group posts by cluster
    for (const [postIdx, memberships] of clusterMemberships) {
      const membershipMap =
        memberships instanceof Map
          ? memberships
          : new Map(Array.from(memberships).map((c) => [c, 1.0]));

      for (const [clusterId, strength] of membershipMap) {
        if (!clusterIndicesMap.has(clusterId)) {
          clusterIndicesMap.set(clusterId, []);
        }

        clusterIndicesMap.get(clusterId)!.push({
          idx: postIdx,
          id: posts[postIdx].id,
          confidence: posts[postIdx].classification_confidence,
          membership_strength: strength,
        });

        // Update post-cluster matrix
        if (!postClusterMatrix.has(postIdx)) {
          postClusterMatrix.set(postIdx, new Set());
        }
        postClusterMatrix.get(postIdx)!.add(`cluster_${clusterId + 1}`);
      }
    }

    // Filter and process each cluster
    let clusterNum = 0;
    for (const [originalClusterId, members] of clusterIndicesMap) {
      if (members.length < minClusterSize) continue;

      clusterNum++;
      const clusterId = `cluster_${clusterNum}`;

      console.log(`\nAnalyzing ${clusterId} with ${members.length} members...`);

      // Separate core and peripheral members
      const coreMembers = members.filter(
        (m) => m.membership_strength >= coreThreshold
      );
      const peripheralMembers = members.filter(
        (m) => m.membership_strength < coreThreshold
      );

      // Get posts for analysis
      const clusterPosts = members.map((m) => posts[m.idx]);

      // Analyze type
      const typeAnalysis = await this.metadataService.analyzeClusterType(
        clusterPosts
      );

      // Generate metadata
      const metadata = await this.metadataService.generateClusterMetadata(
        clusterPosts,
        clusterId
      );

      // Find representative (prefer core members)
      const representative = this.metadataService.findRepresentative(
        posts,
        coreMembers.length > 0 ? coreMembers : members,
        embeddings
      );

      // Calculate aggregated confidence
      const weightedConfidence =
        members.reduce(
          (sum, m) => sum + m.confidence * m.membership_strength,
          0
        ) / members.reduce((sum, m) => sum + m.membership_strength, 0);

      // Calculate cluster cohesion
      const cohesion = MathUtils.calculateClusterCohesion(
        members.map((m) => m.idx),
        similarityMatrix
      );

      const cluster: Cluster = {
        id: clusterId,
        type: typeAnalysis.type,
        title: metadata.title,
        members,
        core_members: coreMembers,
        peripheral_members: peripheralMembers,
        representative,
        keywords: metadata.keywords,
        description: metadata.description,
        aggregated_confidence: Math.round(weightedConfidence * 100) / 100,
        cluster_cohesion: Math.round(cohesion * 100) / 100,
      };

      if (typeAnalysis.type === "mixed" && typeAnalysis.subClusters) {
        cluster.sub_clusters = typeAnalysis.subClusters;
      }

      clusters.push(cluster);
    }

    // Sort clusters by size and cohesion
    clusters.sort((a, b) => {
      const sizeScore = b.members.length - a.members.length;
      const cohesionScore = (b.cluster_cohesion - a.cluster_cohesion) * 10;
      return sizeScore + cohesionScore;
    });

    // Find unclustered posts
    const unclustered: number[] = [];
    for (let i = 0; i < posts.length; i++) {
      if (!postClusterMatrix.has(i) || postClusterMatrix.get(i)!.size === 0) {
        unclustered.push(i);
      }
    }

    // Calculate summary statistics
    let totalMemberships = 0;
    let postsInMultiple = 0;

    for (const [postIdx, clusterIds] of postClusterMatrix) {
      totalMemberships += clusterIds.size;
      if (clusterIds.size > 1) {
        postsInMultiple++;
      }
    }

    const summary = {
      total_posts: posts.length,
      total_clusters: clusters.length,
      problem_clusters: clusters.filter((c) => c.type === "problem").length,
      solution_clusters: clusters.filter((c) => c.type === "solution").length,
      mixed_clusters: clusters.filter((c) => c.type === "mixed").length,
      avg_memberships_per_post:
        posts.length > 0
          ? Math.round((totalMemberships / posts.length) * 100) / 100
          : 0,
      posts_in_multiple_clusters: postsInMultiple,
    };

    console.log("\n=== Clustering Complete ===");
    console.log(`Total clusters: ${clusters.length}`);
    console.log(`Posts in multiple clusters: ${postsInMultiple}`);
    console.log(
      `Average memberships per post: ${summary.avg_memberships_per_post}`
    );
    console.log(`Unclustered: ${unclustered.length} posts`);

    return {
      clusters,
      summary,
      post_cluster_matrix: postClusterMatrix,
      unclustered,
    };
  }

  /**
   * Retrieves all clusters that a specific post belongs to.
   * @param postIdx - Index of the post in the original array.
   * @param result - The clustering result to query.
   * @returns Object containing array of cluster memberships with metadata.
   */
  getClustersForPost(
    postIdx: number,
    result: ClusteringResult
  ): {
    clusters: Array<{
      id: string;
      title: string;
      membership_strength: number;
      is_core: boolean;
    }>;
  } {
    const postClusters: Array<{
      id: string;
      title: string;
      membership_strength: number;
      is_core: boolean;
    }> = [];

    for (const cluster of result.clusters) {
      const membership = cluster.members.find((m) => m.idx === postIdx);
      if (membership) {
        const isCore = cluster.core_members.some((m) => m.idx === postIdx);
        postClusters.push({
          id: cluster.id,
          title: cluster.title,
          membership_strength: membership.membership_strength,
          is_core: isCore,
        });
      }
    }

    // Sort by membership strength
    postClusters.sort((a, b) => b.membership_strength - a.membership_strength);

    return { clusters: postClusters };
  }

  /**
   * Finds posts related to a given post based on shared cluster memberships.
   * @param postIdx - Index of the target post.
   * @param result - The clustering result to analyze.
   * @param posts - Original posts array for reference.
   * @param limit - Maximum number of related posts to return (default: 10).
   * @returns Array of related posts with similarity scores and shared clusters.
   */
  findRelatedPosts(
    postIdx: number,
    result: ClusteringResult,
    posts: PostForClustering[],
    limit: number = 10
  ): Array<{
    idx: number;
    id: string;
    shared_clusters: string[];
    similarity_score: number;
  }> {
    const targetClusters = result.post_cluster_matrix.get(postIdx) || new Set();
    if (targetClusters.size === 0) return [];

    const relatedPosts: Map<
      number,
      {
        shared_clusters: Set<string>;
        total_strength: number;
      }
    > = new Map();

    // Find posts that share clusters
    for (const cluster of result.clusters) {
      if (!targetClusters.has(cluster.id)) continue;

      const targetMembership = cluster.members.find((m) => m.idx === postIdx);
      if (!targetMembership) continue;

      for (const member of cluster.members) {
        if (member.idx === postIdx) continue;

        if (!relatedPosts.has(member.idx)) {
          relatedPosts.set(member.idx, {
            shared_clusters: new Set(),
            total_strength: 0,
          });
        }

        const related = relatedPosts.get(member.idx)!;
        related.shared_clusters.add(cluster.id);
        // Weight by both memberships
        related.total_strength +=
          targetMembership.membership_strength * member.membership_strength;
      }
    }

    // Convert to array and sort
    const results = Array.from(relatedPosts.entries())
      .map(([idx, data]) => ({
        idx,
        id: posts[idx].id,
        shared_clusters: Array.from(data.shared_clusters),
        similarity_score: data.total_strength / data.shared_clusters.size, // Average strength
      }))
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);

    return results;
  }

  /**
   * Merges clusters that have significant overlap in their member posts.
   * Useful for reducing redundancy in clustering results.
   * @param result - The clustering result to optimize.
   * @param posts - Original posts for metadata regeneration.
   * @param overlapThreshold - Minimum overlap ratio to trigger merge (default: 0.7).
   * @returns New clustering result with merged clusters.
   */
  async mergeHighlyOverlappingClusters(
    result: ClusteringResult,
    posts: PostForClustering[],
    overlapThreshold: number = 0.7 // If 70% of members overlap, consider merging
  ): Promise<ClusteringResult> {
    const clusters = [...result.clusters];
    const merged: Set<number> = new Set();
    const newClusters: Cluster[] = [];

    for (let i = 0; i < clusters.length; i++) {
      if (merged.has(i)) continue;

      let mergedCluster = { ...clusters[i] };
      const mergedMembers = new Map<number, ClusterMembership>();

      // Add initial members
      for (const member of mergedCluster.members) {
        mergedMembers.set(member.idx, member);
      }

      for (let j = i + 1; j < clusters.length; j++) {
        if (merged.has(j)) continue;

        // Calculate overlap
        const overlap = clusters[j].members.filter((m) =>
          mergedMembers.has(m.idx)
        ).length;

        const overlapRatio = Math.min(
          overlap / clusters[j].members.length,
          overlap / mergedMembers.size
        );

        if (overlapRatio >= overlapThreshold) {
          console.log(
            `Merging ${clusters[i].id} and ${clusters[j].id} (${(
              overlapRatio * 100
            ).toFixed(1)}% overlap)`
          );

          // Merge cluster j into i
          for (const member of clusters[j].members) {
            if (mergedMembers.has(member.idx)) {
              // Average the membership strengths
              const existing = mergedMembers.get(member.idx)!;
              existing.membership_strength =
                (existing.membership_strength + member.membership_strength) / 2;
            } else {
              mergedMembers.set(member.idx, member);
            }
          }

          // Combine keywords
          mergedCluster.keywords = [
            ...new Set([...mergedCluster.keywords, ...clusters[j].keywords]),
          ];

          // Update type
          if (mergedCluster.type !== clusters[j].type) {
            mergedCluster.type = "mixed";
          }

          merged.add(j);
        }
      }

      // Rebuild merged cluster
      mergedCluster.members = Array.from(mergedMembers.values());

      // Recalculate core and peripheral
      mergedCluster.core_members = mergedCluster.members.filter(
        (m) => m.membership_strength >= 0.6
      );
      mergedCluster.peripheral_members = mergedCluster.members.filter(
        (m) => m.membership_strength < 0.6
      );

      // Regenerate metadata if cluster was merged
      if (
        merged.size > 0 ||
        mergedCluster.members.length !== clusters[i].members.length
      ) {
        const clusterPosts = mergedCluster.members.map((m) => posts[m.idx]);
        const metadata = await this.metadataService.generateClusterMetadata(
          clusterPosts,
          mergedCluster.id
        );
        mergedCluster.title = metadata.title;
        mergedCluster.description = metadata.description;
      }

      newClusters.push(mergedCluster);
    }

    // Rebuild post-cluster matrix
    const newPostClusterMatrix = new Map<number, Set<string>>();
    for (const cluster of newClusters) {
      for (const member of cluster.members) {
        if (!newPostClusterMatrix.has(member.idx)) {
          newPostClusterMatrix.set(member.idx, new Set());
        }
        newPostClusterMatrix.get(member.idx)!.add(cluster.id);
      }
    }

    // Recalculate summary
    let totalMemberships = 0;
    let postsInMultiple = 0;

    for (const [_, clusterIds] of newPostClusterMatrix) {
      totalMemberships += clusterIds.size;
      if (clusterIds.size > 1) {
        postsInMultiple++;
      }
    }

    const summary = {
      total_posts: posts.length,
      total_clusters: newClusters.length,
      problem_clusters: newClusters.filter((c) => c.type === "problem").length,
      solution_clusters: newClusters.filter((c) => c.type === "solution")
        .length,
      mixed_clusters: newClusters.filter((c) => c.type === "mixed").length,
      avg_memberships_per_post:
        posts.length > 0
          ? Math.round((totalMemberships / posts.length) * 100) / 100
          : 0,
      posts_in_multiple_clusters: postsInMultiple,
    };

    return {
      clusters: newClusters,
      summary,
      post_cluster_matrix: newPostClusterMatrix,
      unclustered: result.unclustered,
    };
  }

  // DELEGATED
  /**
   * Exports clustering results to a formatted string representation.
   * @param result - The clustering result to export.
   * @param posts - The original posts that were clustered.
   * @returns A formatted string containing the clustering results.
   */
  exportResults(result: ClusteringResult, posts: PostForClustering[]): string {
    return this.exportUtils.exportResults(result, posts);
  }

  /**
   * Exports incremental clustering results to a formatted string representation.
   * @param result - The incremental clustering result to export.
   * @param newPosts - The new posts that were assigned to clusters.
   * @returns A formatted string containing the incremental clustering results.
   */
  exportIncrementalResults(
    result: IncrementalClusteringResult,
    newPosts: PostForClustering[]
  ): string {
    return this.exportUtils.exportIncrementalResults(result, newPosts);
  }

  /**
   * Assigns new posts to existing clusters or creates new clusters as needed.
   * Uses similarity thresholds to determine cluster membership.
   * @param newPosts - Array of new posts to assign to clusters.
   * @param existingState - The current cluster state with existing clusters.
   * @param options - Configuration options for assignment.
   * @returns Incremental clustering result with assigned posts and any new clusters.
   */
  async assignNewPostsToClusters(
    newPosts: PostForClustering[],
    existingState: ExistingClusterState,
    options: {
      similarityThreshold?: number;
      newClusterThreshold?: number;
      maxClustersPerPost?: number;
      minNewClusterSize?: number;
      autoMerge?: boolean;
      mergeThreshold?: number;
    } = {}
  ): Promise<IncrementalClusteringResult> {
    return this.incrementalService.assignNewPostsToClusters(
      newPosts,
      existingState,
      options
    );
  }

  /**
   * Identifies potential new cluster opportunities for a given post.
   * Finds groups of similar posts that could form new clusters.
   * @param newPost - The post to analyze for new cluster opportunities.
   * @param existingState - The current cluster state to compare against.
   * @param options - Configuration options for finding opportunities.
   * @returns Array of potential cluster candidates with similarity scores and suggested titles.
   */
  async findNewClusterOpportunities(
    newPost: PostForClustering,
    existingState: ExistingClusterState,
    options: {
      similarityThreshold?: number;
      maxCandidates?: number;
    } = {}
  ): Promise<
    Array<{
      posts: PostForClustering[];
      similarity: number;
      suggestedTitle: string;
    }>
  > {
    return this.incrementalService.findNewClusterOpportunities(
      newPost,
      existingState,
      options
    );
  }
}
