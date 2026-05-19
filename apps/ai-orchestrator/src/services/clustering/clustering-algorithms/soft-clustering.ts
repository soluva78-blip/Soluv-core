export class SoftClustering {
  static findDensityPeaks(
    similarityMatrix: number[][],
    maxClusters: number
  ): number[] {
    const n = similarityMatrix.length;
    const densities: number[] = [];

    // Calculate local density for each point
    for (let i = 0; i < n; i++) {
      let density = 0;
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          density += Math.exp(-((1 - similarityMatrix[i][j]) ** 2) / 0.1);
        }
      }
      densities[i] = density;
    }

    // Find peaks
    const peaks: { idx: number; score: number }[] = [];
    const maxDensity = Math.max(...densities);

    for (let i = 0; i < n; i++) {
      let minDistToHigher = Infinity;

      for (let j = 0; j < n; j++) {
        if (densities[j] > densities[i]) {
          const dist = 1 - similarityMatrix[i][j];
          minDistToHigher = Math.min(minDistToHigher, dist);
        }
      }

      if (minDistToHigher === Infinity) {
        minDistToHigher = 1;
      }

      const score = (densities[i] / maxDensity) * minDistToHigher;
      peaks.push({ idx: i, score });
    }

    peaks.sort((a, b) => b.score - a.score);
    return peaks.slice(0, maxClusters).map((p) => p.idx);
  }

  static performSoftClustering(
    embeddings: number[][],
    similarityMatrix: number[][],
    options: {
      minClusters?: number;
      maxClusters?: number;
      membershipThreshold?: number;
      coreThreshold?: number;
    } = {}
  ): Map<number, Map<number, number>> {
    const {
      minClusters = 3,
      maxClusters = Math.ceil(embeddings.length / 3),
      membershipThreshold = 0.3, // Minimum membership strength to belong to a cluster
    } = options;

    const n = embeddings.length;

    // First, find natural cluster centers using density peaks
    const clusterCenters = this.findDensityPeaks(similarityMatrix, maxClusters);
    const k = Math.max(
      minClusters,
      Math.min(clusterCenters.length, maxClusters)
    );

    console.log(
      `Found ${clusterCenters.length} density peaks, using ${k} clusters`
    );

    // Initialize membership matrix: posts x clusters
    // membership[i][j] = membership strength of post i in cluster j
    const membership = new Map<number, Map<number, number>>();

    for (let i = 0; i < n; i++) {
      membership.set(i, new Map());
    }

    // Calculate initial memberships based on similarity to cluster centers
    for (let postIdx = 0; postIdx < n; postIdx++) {
      let totalSim = 0;
      const sims = new Map<number, number>();

      // Calculate similarity to each cluster center
      for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
        const centerIdx = clusterCenters[clusterIdx];
        const sim = similarityMatrix[postIdx][centerIdx];
        sims.set(clusterIdx, sim);
        totalSim += sim;
      }

      // Normalize to get membership strengths
      for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
        const strength = sims.get(clusterIdx)! / totalSim;
        if (strength >= membershipThreshold) {
          membership.get(postIdx)!.set(clusterIdx, strength);
        }
      }
    }

    // Refine memberships iteratively
    for (let iter = 0; iter < 10; iter++) {
      const newMembership = new Map<number, Map<number, number>>();

      for (let postIdx = 0; postIdx < n; postIdx++) {
        newMembership.set(postIdx, new Map());

        // For each cluster, calculate membership based on similarity to current members
        for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
          let weightedSim = 0;
          let totalWeight = 0;

          // Consider similarity to all posts weighted by their membership
          for (let otherIdx = 0; otherIdx < n; otherIdx++) {
            if (otherIdx === postIdx) continue;

            const otherMembership =
              membership.get(otherIdx)?.get(clusterIdx) || 0;
            if (otherMembership > 0) {
              weightedSim +=
                similarityMatrix[postIdx][otherIdx] * otherMembership;
              totalWeight += otherMembership;
            }
          }

          if (totalWeight > 0) {
            const strength = weightedSim / totalWeight;
            if (strength >= membershipThreshold) {
              newMembership.get(postIdx)!.set(clusterIdx, strength);
            }
          }
        }

        // Normalize memberships for this post
        const postMemberships = newMembership.get(postIdx)!;
        if (postMemberships.size > 0) {
          const total = Array.from(postMemberships.values()).reduce(
            (a, b) => a + b,
            0
          );
          for (const [clusterId, strength] of postMemberships) {
            postMemberships.set(clusterId, strength / total);
          }
        }
      }

      // Update membership matrix
      for (const [postIdx, clusterMemberships] of newMembership) {
        membership.set(postIdx, clusterMemberships);
      }
    }

    return membership;
  }
}
