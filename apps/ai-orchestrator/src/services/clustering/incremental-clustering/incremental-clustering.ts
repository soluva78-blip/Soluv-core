import { ClusterMetadataService } from "../cluster-analysis/cluster-metadata";
import {
  Cluster,
  ClusterMembership,
  ExistingClusterState,
  IncrementalClusteringResult,
  PostForClustering,
} from "../types";
import { EmbeddingService } from "../utils/generate-embedding";
import { MathUtils } from "../utils/math-utils";

export class IncrementalClusteringService {
  constructor(
    private metadataService: ClusterMetadataService,
    private embedding: EmbeddingService,
    private embeddingCache: Map<string, number[]>,
    private clusterCentroids: Map<string, number[]>
  ) {}

  async loadClusterState(state: ExistingClusterState): Promise<void> {
    this.clusterCentroids = new Map(state.clusterEmbeddings);
    this.embeddingCache = new Map(state.postEmbeddings);
  }
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
    const {
      similarityThreshold = 0.5, // Min similarity to join existing cluster
      newClusterThreshold = 0.65, // Min similarity between posts to form new cluster
      maxClustersPerPost = 3,
      minNewClusterSize = 2,
      autoMerge = false,
      mergeThreshold = 0.8,
    } = options;

    console.log(
      `Processing ${newPosts.length} new posts for incremental clustering...`
    );

    // Load existing state
    await this.loadClusterState(existingState);

    // Generate embeddings for new posts
    const newEmbeddings = await this.embedding.generateEmbeddings(newPosts);

    // Results tracking
    const assignments: IncrementalClusteringResult["assignments"] = [];
    const modifiedClusters = new Set<string>();
    const updatedClusters = new Map<string, Cluster>();
    const unassignedPosts: {
      post: PostForClustering;
      embedding: number[];
      idx: number;
    }[] = [];

    // Copy existing clusters for updates
    for (const cluster of existingState.clusters) {
      updatedClusters.set(cluster.id, JSON.parse(JSON.stringify(cluster)));
    }

    // Process each new post
    for (let i = 0; i < newPosts.length; i++) {
      const post = newPosts[i];
      const embedding = newEmbeddings[i];

      // Calculate similarity to all existing cluster centroids
      const clusterSimilarities: Array<{
        clusterId: string;
        similarity: number;
        cluster: Cluster;
      }> = [];

      for (const [clusterId, centroid] of this.clusterCentroids) {
        const similarity = MathUtils.cosineSimilarity(embedding, centroid);
        const cluster = updatedClusters.get(clusterId)!;
        clusterSimilarities.push({ clusterId, similarity, cluster });
      }

      // Sort by similarity
      clusterSimilarities.sort((a, b) => b.similarity - a.similarity);

      // Assign to clusters that meet threshold
      const assignedClusters: Array<{
        clusterId: string;
        membershipStrength: number;
        isNew: boolean;
      }> = [];

      let totalSimilarity = 0;
      const eligibleClusters = clusterSimilarities
        .filter((c) => c.similarity >= similarityThreshold)
        .slice(0, maxClustersPerPost);

      if (eligibleClusters.length > 0) {
        // Calculate membership strengths (normalized similarities)
        totalSimilarity = eligibleClusters.reduce(
          (sum, c) => sum + c.similarity,
          0
        );
        for (const { clusterId, similarity, cluster } of eligibleClusters) {
          const membershipStrength = similarity / totalSimilarity;

          // Add to cluster
          const membership: ClusterMembership = {
            idx: post.idx,
            id: post.id,
            confidence: post.classification_confidence,
            membership_strength: membershipStrength,
          };

          cluster?.members.push(membership);

          // Update core/peripheral classification
          if (membershipStrength >= 0.6) {
            cluster.core_members.push(membership);
          } else {
            cluster.peripheral_members.push(membership);
          }

          // Update cluster centroid
          const updatedEmbeddings = cluster.members.map((m) => {
            let emb = this.embeddingCache.get(m.id);
            if (!emb && m.id === post.id) {
              emb = embedding;
            }
            return { embedding: emb!, weight: m.membership_strength };
          });

          const newCentroid =
            MathUtils.calculateWeightedCentroid(updatedEmbeddings);
          this.clusterCentroids.set(clusterId, newCentroid);

          assignedClusters.push({
            clusterId,
            membershipStrength,
            isNew: false,
          });

          modifiedClusters.add(clusterId);
        }
      } else {
        // Post doesn't fit well in existing clusters
        unassignedPosts.push({ post, embedding, idx: i });
      }

      if (assignedClusters.length > 0) {
        assignments.push({
          postId: post.id,
          postIdx: post.idx,
          clusters: assignedClusters,
        });
      }

      // Cache the embedding
      this.embeddingCache.set(post.id, embedding);
    }

    // Process unassigned posts to form new clusters
    const newClusters: Cluster[] = [];
    if (unassignedPosts.length >= minNewClusterSize) {
      console.log(
        `Checking ${unassignedPosts.length} unassigned posts for new cluster formation...`
      );

      // Create similarity matrix for unassigned posts
      const unassignedSimilarities: number[][] = [];
      for (let i = 0; i < unassignedPosts.length; i++) {
        unassignedSimilarities[i] = [];
        for (let j = 0; j < unassignedPosts.length; j++) {
          if (i === j) {
            unassignedSimilarities[i][j] = 1;
          } else {
            unassignedSimilarities[i][j] = MathUtils.cosineSimilarity(
              unassignedPosts[i].embedding,
              unassignedPosts[j].embedding
            );
          }
        }
      }

      // Find groups of similar unassigned posts
      const visited = new Set<number>();
      const groups: number[][] = [];

      for (let i = 0; i < unassignedPosts.length; i++) {
        if (visited.has(i)) continue;

        const group = [i];
        visited.add(i);

        // Find all posts similar to this one
        for (let j = i + 1; j < unassignedPosts.length; j++) {
          if (visited.has(j)) continue;

          // Check if this post is similar enough to any post in the group
          let maxSim = 0;
          for (const memberIdx of group) {
            maxSim = Math.max(maxSim, unassignedSimilarities[memberIdx][j]);
          }

          if (maxSim >= newClusterThreshold) {
            group.push(j);
            visited.add(j);
          }
        }

        if (group.length >= minNewClusterSize) {
          groups.push(group);
        }
      }

      // Create new clusters from groups
      let newClusterNum = existingState.clusters.length + 1;
      for (const group of groups) {
        const clusterId = `cluster_${newClusterNum++}`;
        const clusterPosts = group.map((idx) => unassignedPosts[idx].post);
        const clusterEmbeddings = group.map(
          (idx) => unassignedPosts[idx].embedding
        );

        // Calculate cluster type
        const typeAnalysis = await this.metadataService.analyzeClusterType(
          clusterPosts
        );

        // Generate metadata
        const metadata = await this.metadataService.generateClusterMetadata(
          clusterPosts,
          clusterId
        );

        // Create members with equal membership strength
        const members: ClusterMembership[] = group.map((idx) => ({
          idx: unassignedPosts[idx].post.idx,
          id: unassignedPosts[idx].post.id,
          confidence: unassignedPosts[idx].post.classification_confidence,
          membership_strength: 1.0 / group.length,
        }));

        // Calculate centroid
        const centroid = MathUtils.calculateCentroid(clusterEmbeddings);
        this.clusterCentroids.set(clusterId, centroid);

        // Find representative
        const representative = this.metadataService.findRepresentative(
          clusterPosts,
          members,
          clusterEmbeddings
        );

        // Calculate cohesion
        const cohesion = MathUtils.calculateClusterCohesion(
          group,
          unassignedSimilarities
        );

        const newCluster: Cluster = {
          id: clusterId,
          type: typeAnalysis.type,
          title: metadata.title,
          members,
          core_members: members, // All members are core in new clusters
          peripheral_members: [],
          representative,
          keywords: metadata.keywords,
          description: metadata.description,
          aggregated_confidence:
            members.reduce((sum, m) => sum + m.confidence, 0) / members.length,
          cluster_cohesion: cohesion,
          sub_clusters: typeAnalysis.subClusters,
        };

        newClusters.push(newCluster);
        updatedClusters.set(clusterId, newCluster);

        // Update assignments
        for (const idx of group) {
          const postData = unassignedPosts[idx];
          const existingAssignment = assignments.find(
            (a) => a.postId === postData.post.id
          );

          if (existingAssignment) {
            existingAssignment.clusters.push({
              clusterId,
              membershipStrength: 1.0 / group.length,
              isNew: true,
            });
          } else {
            assignments.push({
              postId: postData.post.id,
              postIdx: postData.post.idx,
              clusters: [
                {
                  clusterId,
                  membershipStrength: 1.0 / group.length,
                  isNew: true,
                },
              ],
            });
          }
        }
      }
    }

    // Check for potential cluster merges if requested
    let suggestedMerges: IncrementalClusteringResult["suggestedMerges"] =
      undefined;
    if (autoMerge || mergeThreshold < 1) {
      suggestedMerges = await this.findPotentialMerges(
        Array.from(updatedClusters.values()),
        mergeThreshold
      );
    }

    // Update cluster metadata for modified clusters
    for (const clusterId of modifiedClusters) {
      const cluster = updatedClusters.get(clusterId)!;

      // Recalculate aggregated confidence
      cluster.aggregated_confidence =
        cluster.members.reduce(
          (sum, m) => sum + m.confidence * m.membership_strength,
          0
        ) / cluster.members.reduce((sum, m) => sum + m.membership_strength, 0);

      // Update cluster cohesion if significantly changed
      if (
        cluster.members.length >
        existingState.clusters.find((c) => c.id === clusterId)!.members.length *
          1.2
      ) {
        // Regenerate title and description if cluster grew significantly
        const allPosts = [...existingState.posts, ...newPosts];
        const clusterPosts = cluster.members.map(
          (m) => allPosts.find((p) => p.id === m.id)!
        );
        const metadata = await this.metadataService.generateClusterMetadata(
          clusterPosts,
          clusterId
        );
        cluster.title = metadata.title;
        cluster.description = metadata.description;
        cluster.keywords = metadata.keywords;
      }
    }

    return {
      updatedClusters: Array.from(updatedClusters.values()),
      newClusters,
      modifiedClusters: Array.from(modifiedClusters),
      assignments,
      suggestedMerges,
    };
  }

  private async findPotentialMerges(
    clusters: Cluster[],
    threshold: number = 0.8
  ): Promise<
    Array<{ cluster1: string; cluster2: string; similarity: number }>
  > {
    const merges: Array<{
      cluster1: string;
      cluster2: string;
      similarity: number;
    }> = [];

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const centroid1 = this.clusterCentroids.get(clusters[i].id);
        const centroid2 = this.clusterCentroids.get(clusters[j].id);

        if (centroid1 && centroid2) {
          const similarity = MathUtils.cosineSimilarity(centroid1, centroid2);

          if (similarity >= threshold) {
            merges.push({
              cluster1: clusters[i].id,
              cluster2: clusters[j].id,
              similarity,
            });
          }
        }
      }
    }

    return merges.sort((a, b) => b.similarity - a.similarity);
  }

  // Helper method to check if a new post should create a new cluster with existing posts
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
    const { similarityThreshold = 0.6, maxCandidates = 5 } = options;

    // Generate embedding for new post
    const [newEmbedding] = await this.embedding.generateEmbeddings([newPost]);

    // Find unclustered or weakly clustered posts
    const candidates: Array<{
      post: PostForClustering;
      embedding: number[];
      clusterStrength: number;
    }> = [];

    // Check all existing posts
    for (const post of existingState.posts) {
      // Find this post's strongest cluster membership
      let maxStrength = 0;
      for (const cluster of existingState.clusters) {
        const membership = cluster.members.find((m) => m.id === post.id);
        if (membership) {
          maxStrength = Math.max(maxStrength, membership.membership_strength);
        }
      }

      // Consider posts that are weakly clustered or unclustered
      if (maxStrength < 0.5) {
        const embedding = this.embeddingCache.get(post.id);
        if (embedding) {
          candidates.push({
            post,
            embedding,
            clusterStrength: maxStrength,
          });
        }
      }
    }

    // Find similar candidates
    const opportunities: Array<{
      posts: PostForClustering[];
      similarity: number;
      suggestedTitle: string;
    }> = [];

    for (const candidate of candidates) {
      const similarity = MathUtils.cosineSimilarity(
        newEmbedding,
        candidate.embedding
      );

      if (similarity >= similarityThreshold) {
        const posts = [newPost, candidate.post];
        const metadata = await this.metadataService.generateClusterMetadata(
          posts,
          "temp"
        );

        opportunities.push({
          posts,
          similarity,
          suggestedTitle: metadata.title,
        });
      }
    }

    // Sort by similarity and return top candidates
    return opportunities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxCandidates);
  }
}
