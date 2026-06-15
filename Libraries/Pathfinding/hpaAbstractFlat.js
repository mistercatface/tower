import { runAbstractAStarFlat } from "./AStar.js";
export const MAX_HPA_GRAPH_NODES = 1024;
/**
 * @param {Record<string, { col: number, row: number, edges: { targetId: string, cost: number }[] }>} nodesMap
 * @param {string[]} nodeIds
 */
export function bakeAbstractGraphFlat(nodesMap, nodeIds) {
    const nodeCount = nodeIds.length;
    const nodeCol = new Int16Array(nodeCount);
    const nodeRow = new Int16Array(nodeCount);
    const edgeOffsets = new Int32Array(nodeCount + 1);
    const edgeTargets = [];
    const edgeCosts = [];
    const idToIdx = new Map();
    for (let i = 0; i < nodeCount; i++) idToIdx.set(nodeIds[i], i);
    let write = 0;
    for (let i = 0; i < nodeCount; i++) {
        edgeOffsets[i] = write;
        const node = nodesMap[nodeIds[i]];
        nodeCol[i] = node.col;
        nodeRow[i] = node.row;
        for (let e = 0; e < node.edges.length; e++) {
            const targetIdx = idToIdx.get(node.edges[e].targetId);
            if (targetIdx === undefined) continue;
            edgeTargets.push(targetIdx);
            edgeCosts.push(node.edges[e].cost);
            write++;
        }
    }
    edgeOffsets[nodeCount] = write;
    return { nodeCount, nodeCol, nodeRow, edgeOffsets, edgeTargets: Int16Array.from(edgeTargets), edgeCosts: Uint16Array.from(edgeCosts), edgeWrite: write, idToIdx };
}
/**
 * Pack region graph for worker CSR build — no main-thread bake.
 * @param {Record<string, { col: number, row: number, edges: { targetId: string, cost: number }[] }>} nodesMap
 * @param {string[]} nodeIds
 */
export function packHpaGraphForWorker(nodesMap, nodeIds) {
    const nodeCount = nodeIds.length;
    const nodeCol = new Int16Array(nodeCount);
    const nodeRow = new Int16Array(nodeCount);
    const edgeSources = [];
    const edgeTargets = [];
    const edgeCosts = [];
    const idToIdx = new Map();
    for (let i = 0; i < nodeCount; i++) {
        idToIdx.set(nodeIds[i], i);
        const node = nodesMap[nodeIds[i]];
        nodeCol[i] = node.col;
        nodeRow[i] = node.row;
    }
    for (let i = 0; i < nodeCount; i++) {
        const edges = nodesMap[nodeIds[i]].edges;
        for (let e = 0; e < edges.length; e++) {
            const targetIdx = idToIdx.get(edges[e].targetId);
            if (targetIdx === undefined) continue;
            edgeSources.push(i);
            edgeTargets.push(targetIdx);
            edgeCosts.push(edges[e].cost);
        }
    }
    return {
        nodeCount,
        nodeCol,
        nodeRow,
        edgeSources: Int16Array.from(edgeSources),
        edgeTargets: Int16Array.from(edgeTargets),
        edgeCosts: Uint16Array.from(edgeCosts),
        edgeWrite: edgeSources.length,
        idToIdx,
        nodeIds,
    };
}
/**
 * @param {string} startNodeId
 * @param {string} targetNodeId
 * @param {Record<string, { col: number, row: number, edges: { targetId: string, cost: number }[] }>} nodesMap
 * @param {string[]} nodeIds
 * @returns {string[] | null}
 */
export function runAbstractAStarOnGraph(startNodeId, targetNodeId, nodesMap, nodeIds) {
    const baked = bakeAbstractGraphFlat(nodesMap, nodeIds);
    const startIdx = baked.idToIdx.get(startNodeId);
    const targetIdx = baked.idToIdx.get(targetNodeId);
    if (startIdx === undefined || targetIdx === undefined) return null;
    const pathIdx = runAbstractAStarFlat(startIdx, targetIdx, baked.nodeCol, baked.nodeRow, baked.edgeOffsets, baked.edgeTargets, baked.edgeCosts, baked.nodeCount);
    if (!pathIdx) return null;
    return pathIdx.map((idx) => nodesMap[nodeIds[idx]]);
}
