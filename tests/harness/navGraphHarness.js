export function packedRegionGraphFromWorker(worker) {
    const nodeCount = worker.graphNodeCount;
    if (nodeCount <= 0) return null;
    const edgeOffsets = new Int32Array(worker.sabPersistGraphEdgeOffsets, 0, nodeCount + 1);
    const edgeWrite = edgeOffsets[nodeCount];
    return {
        nodeCount,
        edgeWrite,
        edgeSources: new Int16Array(worker.sabPersistGraphEdgeSources, 0, edgeWrite),
        edgeTargets: new Int16Array(worker.sabPersistGraphEdgeTargets, 0, edgeWrite),
        cellToRegion: worker.graphCellToRegion,
    };
}

export function hasDirectedRegionPath(packed, startRegion, targetRegion) {
    if (startRegion < 0 || targetRegion < 0) return false;
    if (startRegion === targetRegion) return true;
    const { nodeCount, edgeSources, edgeTargets, edgeWrite } = packed;
    const adj = Array.from({ length: nodeCount }, () => []);
    for (let e = 0; e < edgeWrite; e++) adj[edgeSources[e]].push(edgeTargets[e]);
    const seen = new Uint8Array(nodeCount);
    const q = [startRegion];
    seen[startRegion] = 1;
    for (let qi = 0; qi < q.length; qi++) {
        const region = q[qi];
        if (region === targetRegion) return true;
        const neighbors = adj[region];
        for (let i = 0; i < neighbors.length; i++) {
            const next = neighbors[i];
            if (seen[next]) continue;
            seen[next] = 1;
            q.push(next);
        }
    }
    return false;
}
