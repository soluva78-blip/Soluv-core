/**
 * Represents a post that will be used as input for clustering algorithms.
 */
interface PostForClustering {
  /** Index of the post in the dataset. */
  idx: number;
  /** Unique identifier for the post. */
  id: string;
  /** Source platform or origin of the post (e.g., twitter, reddit). */
  source: string;
  /** Main textual content of the post. */
  body: string;
  /** Array of extracted keywords relevant to the post. */
  keywords: string[];
  /** Category identifier assigned to the post. */
  category_id: number;
  /** Classification label (e.g., problem, solution). */
  classification: string;
  /** Confidence score of the classification (0-1). */
  classification_confidence: number;
  /** ISO 8601 timestamp indicating when the post was created. */
  created_at: string;
}

/**
 * Describes the membership of a post within a cluster.
 */
interface ClusterMembership {
  /** Index of the post in the dataset. */
  idx: number;
  /** Unique identifier of the post. */
  id: string;
  /** Confidence score of this membership assignment. */
  confidence: number;
  /** Strength of membership, ranging from 0 (weak) to 1 (strong). */
  membership_strength: number;
}

/**
 * Represents a cluster of related posts.
 */
interface Cluster {
  /** Unique identifier for the cluster. */
  id: string;
  /** Type indicating whether the cluster is problem-focused, solution-focused, or mixed. */
  type: "problem" | "solution" | "mixed";
  /** Human-readable title summarizing the cluster theme. */
  title: string;
  /** All posts that belong to this cluster. */
  members: ClusterMembership[];
  /** Posts with high membership strength (close to 1). */
  core_members: ClusterMembership[];
  /** Posts with lower membership strength (closer to 0). */
  peripheral_members: ClusterMembership[];
  /** Representative post selected to exemplify the cluster. */
  representative: {
    /** Index of the representative post. */
    idx: number;
    /** ID of the representative post. */
    id: string;
  };
  /** Keywords that characterize the cluster. */
  keywords: string[];
  /** Descriptive summary of the cluster. */
  description: string;
  /** Aggregated confidence score across all members. */
  aggregated_confidence: number;
  /** Measure of how tightly connected the cluster members are (0-1). */
  cluster_cohesion: number;
  /** Optional indices of sub-clusters categorized by type. */
  sub_clusters?: {
    /** Indices of posts in problem sub-clusters. */
    problem?: number[];
    /** Indices of posts in solution sub-clusters. */
    solution?: number[];
  };
}

/**
 * Holds the current state of clusters and embeddings for incremental clustering.
 */
interface ExistingClusterState {
  /** Array of existing clusters. */
  clusters: Cluster[];
  /** Map from cluster ID to centroid embedding vector. */
  clusterEmbeddings: Map<string, number[]>;
  /** Posts available for clustering. */
  posts: PostForClustering[];
  /** Map from post ID to embedding vector. */
  postEmbeddings: Map<string, number[]>;
  /** Timestamp of the last update to this state. */
  lastUpdated: Date;
}

/**
 * Result of an incremental clustering operation.
 */
interface IncrementalClusteringResult {
  /** Clusters that were updated with new data. */
  updatedClusters: Cluster[];
  /** Newly formed clusters. */
  newClusters: Cluster[];
  /** IDs of clusters that were modified during the operation. */
  modifiedClusters: string[];
  /** Assignment details for each post processed. */
  assignments: Array<{
    /** ID of the post. */
    postId: string;
    /** Index of the post. */
    postIdx: number;
    /** Clusters to which the post was assigned. */
    clusters: Array<{
      /** ID of the cluster. */
      clusterId: string;
      /** Strength of the membership. */
      membershipStrength: number;
      /** Indicates if this is a newly created cluster. */
      isNew: boolean;
    }>;
  }>;
  /** Optional suggestions for merging similar clusters. */
  suggestedMerges?: Array<{
    /** ID of the first cluster. */
    cluster1: string;
    /** ID of the second cluster. */
    cluster2: string;
    /** Similarity score between the two clusters (0-1). */
    similarity: number;
  }>;
}

/**
 * Final result of a complete clustering operation.
 */
interface ClusteringResult {
  /** All clusters generated. */
  clusters: Cluster[];
  /** Summary statistics of the clustering. */
  summary: {
    /** Total number of posts processed. */
    total_posts: number;
    /** Total number of clusters created. */
    total_clusters: number;
    /** Number of problem-type clusters. */
    problem_clusters: number;
    /** Number of solution-type clusters. */
    solution_clusters: number;
    /** Number of mixed-type clusters. */
    mixed_clusters: number;
    /** Average number of cluster memberships per post. */
    avg_memberships_per_post: number;
    /** Count of posts assigned to multiple clusters. */
    posts_in_multiple_clusters: number;
  };
  /** Mapping from post index to set of cluster IDs. */
  post_cluster_matrix: Map<number, Set<string>>;
  /** Indices of posts that were not assigned to any cluster. */
  unclustered: number[];
}

export type {
  Cluster,
  ClusteringResult,
  ClusterMembership,
  ExistingClusterState,
  IncrementalClusteringResult,
  PostForClustering,
};
