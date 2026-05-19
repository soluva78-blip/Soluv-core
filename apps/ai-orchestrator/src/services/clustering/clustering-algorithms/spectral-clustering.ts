export class SpectralClustering {
  static performSpectralClusteringWithOverlap(
    similarityMatrix: number[][],
    numClusters: number,
    overlapThreshold: number = 0.4
  ): Map<number, Set<number>> {
    const n = similarityMatrix.length;
    const postClusters = new Map<number, Set<number>>();

    // Initialize
    for (let i = 0; i < n; i++) {
      postClusters.set(i, new Set());
    }

    // Select diverse starting points
    const clusterCenters: number[] = [];
    const used = new Set<number>();

    for (let k = 0; k < numClusters; k++) {
      let bestIdx = -1;
      let maxMinDist = -1;

      for (let i = 0; i < n; i++) {
        if (used.has(i)) continue;

        let minDist = Infinity;
        for (const center of clusterCenters) {
          minDist = Math.min(minDist, 1 - similarityMatrix[i][center]);
        }

        if (minDist > maxMinDist) {
          maxMinDist = minDist;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        clusterCenters.push(bestIdx);
        used.add(bestIdx);
      }
    }

    // Assign posts to clusters
    for (let i = 0; i < n; i++) {
      const similarities: { cluster: number; sim: number }[] = [];

      for (let k = 0; k < clusterCenters.length; k++) {
        similarities.push({
          cluster: k,
          sim: similarityMatrix[i][clusterCenters[k]],
        });
      }

      similarities.sort((a, b) => b.sim - a.sim);

      // Assign to best cluster
      postClusters.get(i)!.add(similarities[0].cluster);

      // Also assign to other clusters if similarity is high enough
      for (let j = 1; j < similarities.length; j++) {
        if (
          similarities[j].sim >= overlapThreshold &&
          similarities[j].sim >= similarities[0].sim * 0.8
        ) {
          postClusters.get(i)!.add(similarities[j].cluster);
        }
      }
    }

    return postClusters;
  }
}
