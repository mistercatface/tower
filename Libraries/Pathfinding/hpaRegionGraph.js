import { bfsIndices } from "../DataStructures/gridBfs.js";
import { colRowToIndex, forEachCardinalNeighborIdx, makeAdjacencyKey, octileDistanceIdx } from "../Spatial/grid/GridUtils.js";
import { findNearestOpenCellIdx } from "./hpaReplan.js";
import { cellBoundsForGrid, forEachDenseCellInBounds, padCellIdxToGrid, padCellBoundsToGrid } from "../DataStructures/CellRect.js";
import { snapshotWorldToGrid } from "./GridNavSnapshot.js";
import { RegionNode, computeDistanceTransform, generateVoronoiRegions, repositionNodeCentroid, repositionRegionCentroids, mergeSmallRegions, floodFillRegion } from "./VoronoiRegions.js";
export const REGION_CELL_UNASSIGNED = -1;
export class HpaRegionGraph {
    constructor(frame, nodesMap = {}, cellToNode = null, nodeIdCounter = 0) {
        this.frame = frame;
        this.nodesMap = nodesMap;
        this.cellToNode = cellToNode ?? new Int32Array(frame.cols * frame.rows).fill(-1);
        this.nodeIdCounter = nodeIdCounter;
    }
    static fromState(state, frame) {
        return new HpaRegionGraph(frame, state.nodesMap, state.cellToNode, state.nodeIdCounter);
    }
    static fromVoronoiResult(result, frame) {
        return new HpaRegionGraph(frame, result.nodesMap, result.cellToNode, 0);
    }
    exportState() {
        return { nodesMap: this.nodesMap, cellToNode: this.cellToNode, nodeIdCounter: this.nodeIdCounter };
    }
    assignCell(node, idx) {
        if (!node) return;
        this.cellToNode[idx] = node.idx;
        node.cells.push(idx);
    }
    unassignCell(idx) {
        this.cellToNode[idx] = -1;
    }
    nodes() {
        return Object.values(this.nodesMap);
    }
    nodeIds() {
        return Object.keys(this.nodesMap);
    }
    clearEdges(node) {
        if (node) node.edges = [];
    }
    clearAllEdges() {
        for (const node of this.nodes()) this.clearEdges(node);
    }
    connectEdge(nodeA, nodeB) {
        if (!nodeA || !nodeB || nodeA.id === nodeB.id) return;
        const cols = this.frame.cols;
        const costAB = octileDistanceIdx(nodeA.idx, nodeB.idx, cols);
        if (costAB > 0 && !nodeA.edges.some((e) => e.targetId === nodeB.id)) nodeA.edges.push({ targetId: nodeB.id, cost: costAB });
    }
    stripEdgesBetween(nodeA, nodeB) {
        if (!nodeA || !nodeB) return;
        nodeA.edges = nodeA.edges.filter((e) => e.targetId !== nodeB.id);
        nodeB.edges = nodeB.edges.filter((e) => e.targetId !== nodeA.id);
    }
    removeInboundEdges(targetId) {
        for (const node of this.nodes()) node.edges = node.edges.filter((edge) => edge.targetId !== targetId);
    }
    createRegionAtCell(startIdx) {
        const id = startIdx;
        const node = new RegionNode(id, startIdx);
        this.nodesMap[id] = node;
        return node;
    }
    getNode(idOrIdx) {
        return this.nodesMap[idOrIdx] ?? null;
    }
    nodeForCell(idx) {
        const nodeIdx = this.cellToNode[idx];
        if (nodeIdx === undefined || nodeIdx === -1) return null;
        return this.nodesMap[nodeIdx] ?? null;
    }
    removeRegion(node) {
        if (!node) throw new Error("removeRegion: node must be defined");
        for (let i = 0; i < node.cells.length; i++) this.cellToNode[node.cells[i]] = -1;
        delete this.nodesMap[node.id];
        this.removeInboundEdges(node.id);
    }
    collectRegionIdsInBounds(bounds) {
        const ids = new Set();
        forEachDenseCellInBounds(bounds, this.frame.cols, (_col, _row, idx) => {
            const node = this.nodeForCell(idx);
            if (node) ids.add(node.id);
        });
        return ids;
    }
    stripCellFromRegion(idx) {
        const node = this.nodeForCell(idx);
        if (!node) return null;
        node.cells = node.cells.filter((cellIdx) => cellIdx !== idx);
        this.unassignCell(idx);
        return node;
    }
    syncState(state) {
        state.nodesMap = this.nodesMap;
        state.cellToNode = this.cellToNode;
        state.nodeIdCounter = this.nodeIdCounter;
    }
}
export function expandRegionDamageBounds(idxOrBounds, frame, padding = 12) {
    if (typeof idxOrBounds === "number") return padCellIdxToGrid(idxOrBounds, frame.cols, frame.rows, padding);
    return padCellBoundsToGrid(idxOrBounds, frame.cols, frame.rows, padding);
}
function regionsShareDirectedPassableLink(navGraph, frame, nodeA, nodeB) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return false;
    const { cols, rows } = frame;
    const targetCells = new Set(nodeB.cells);
    for (let i = 0; i < nodeA.cells.length; i++) {
        const idx = nodeA.cells[i];
        let linked = false;
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (linked || !targetCells.has(nIdx)) return;
            if (navGraph.canStepIdx(idx, nIdx)) linked = true;
        });
        if (linked) return true;
    }
    return false;
}
function validateRegionEdges(navGraph, frame, node, graph) {
    if (!node) return;
    node.edges = node.edges.filter((edge) => {
        const other = graph.getNode(edge.targetId);
        return other && regionsShareDirectedPassableLink(navGraph, frame, node, other);
    });
}
function reconnectRegionEdges(navGraph, blocked, frame, graph, node) {
    if (!node) return;
    const { cols, rows } = frame;
    for (const edge of [...node.edges]) graph.stripEdgesBetween(node, graph.getNode(edge.targetId));
    for (const other of graph.nodes()) if (other.id !== node.id) other.edges = other.edges.filter((edge) => edge.targetId !== node.id);
    const neighborIds = new Set();
    const nodeCells = node.cells;
    for (let i = 0; i < nodeCells.length; i++) {
        const idx = nodeCells[i];
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (blocked[nIdx]) return;
            if (!navGraph.canStepIdx(idx, nIdx) && !navGraph.canStepIdx(nIdx, idx)) return;
            const other = graph.nodeForCell(nIdx);
            if (other && other.id !== node.id) neighborIds.add(other.id);
        });
    }
    for (const otherId of neighborIds) {
        const other = graph.getNode(otherId);
        if (!other) continue;
        if (regionsShareDirectedPassableLink(navGraph, frame, node, other)) graph.connectEdge(node, other);
        if (regionsShareDirectedPassableLink(navGraph, frame, other, node)) graph.connectEdge(other, node);
    }
}
function createRegionFromCells(cells, blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph) {
    const { cols, rows } = frame;
    if (cells.length === 0) return { newIds: [], nodeIdCounter: graph.nodeIdCounter };
    if (!distToWall || distToWall.length !== cols * rows) distToWall = computeDistanceTransform(blocked, frame, distToWall);
    const unassigned = new Set(cells);
    const starts = [...unassigned].sort((a, b) => distToWall[b] - distToWall[a]);
    const newIds = [];
    for (let s = 0; s < starts.length; s++) {
        const startIdx = starts[s];
        if (!unassigned.has(startIdx)) continue;
        const node = graph.createRegionAtCell(startIdx);
        node.cells.length = 0;
        floodFillRegion(startIdx, node, blocked, frame, graph.cellToNode, node.cells, maxCellsPerChunk, navGraph, unassigned);
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame, graph.nodesMap);
        newIds.push(node.id);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(graph.nodesMap, graph.cellToNode, frame, minCellsPerChunk, navGraph);
    repositionRegionCentroids(graph.nodesMap, blocked, frame, graph.cellToNode);
    return { newIds, nodeIdCounter: graph.nodeIdCounter, distToWall };
}
function stripBlockedCellsFromRegions(blocked, frame, bounds, graph) {
    const { cols } = frame;
    const touched = new Set();
    forEachDenseCellInBounds(bounds, cols, (_col, _row, idx) => {
        if (!blocked[idx]) return;
        const node = graph.stripCellFromRegion(idx);
        if (!node) return;
        touched.add(node.id);
    });
    for (const id of [...touched]) {
        const node = graph.getNode(id);
        if (!node) continue;
        if (node.cells.length === 0) {
            graph.removeRegion(node);
            continue;
        }
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame, graph.nodesMap);
    }
}
function repackHullRegions(blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph, bounds) {
    const { cols } = frame;
    const regionIds = graph.collectRegionIdsInBounds(bounds);
    const cells = new Set();
    for (const id of regionIds) {
        const node = graph.getNode(id);
        if (!node) continue;
        for (let i = 0; i < node.cells.length; i++) cells.add(node.cells[i]);
        graph.removeRegion(node);
    }
    forEachDenseCellInBounds(bounds, cols, (_col, _row, idx) => {
        if (!blocked[idx]) cells.add(idx);
    });
    if (cells.size === 0) return { repackedIds: [], nodeIdCounter: graph.nodeIdCounter, distToWall };
    distToWall = computeDistanceTransform(blocked, frame, distToWall);
    const { newIds, nodeIdCounter: nextCounter, distToWall: dist } = createRegionFromCells([...cells], blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph);
    return { repackedIds: newIds, nodeIdCounter: nextCounter, distToWall: dist };
}
function connectAllNodes(navGraph, blocked, frame, graph) {
    graph.clearAllEdges();
    const { cols, rows } = frame;
    forEachDenseCellInBounds(cellBoundsForGrid(cols, rows), cols, (col, row, idx) => {
        const node = graph.nodeForCell(idx);
        if (!node) return;
        if (col + 1 < cols) {
            const right = graph.nodeForCell(idx + 1);
            if (right && right.id !== node.id) {
                if (navGraph.canStepIdx(idx, idx + 1)) graph.connectEdge(node, right);
                if (navGraph.canStepIdx(idx + 1, idx)) graph.connectEdge(right, node);
            }
        }
        if (row + 1 < rows) {
            const down = graph.nodeForCell(idx + cols);
            if (down && down.id !== node.id) {
                if (navGraph.canStepIdx(idx, idx + cols)) graph.connectEdge(node, down);
                if (navGraph.canStepIdx(idx + cols, idx)) graph.connectEdge(down, node);
            }
        }
    });
    for (const node of graph.nodes()) validateRegionEdges(navGraph, frame, node, graph);
}
function pruneUnreachableRegions(navGraph, blocked, frame, graph, seedWorldX, seedWorldY) {
    const { cols, rows } = frame;
    const { col, row } = snapshotWorldToGrid(frame, seedWorldX, seedWorldY);
    const seedIdx = colRowToIndex(col, row, cols);
    const startIdx = findNearestOpenCellIdx(blocked, cols, rows, seedIdx);
    const reachable = new Uint8Array(cols * rows);
    reachable[startIdx] = 1;
    bfsIndices([startIdx], (idx, enqueue) => {
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (blocked[nIdx] || reachable[nIdx]) return;
            if (!navGraph.canStepIdx(idx, nIdx)) return;
            reachable[nIdx] = 1;
            enqueue(nIdx);
        });
    });
    for (const node of graph.nodes()) {
        let hasReachableCell = false;
        for (let i = 0; i < node.cells.length; i++)
            if (reachable[node.cells[i]]) {
                hasReachableCell = true;
                break;
            }
        if (hasReachableCell) continue;
        graph.removeRegion(node);
    }
    for (const node of graph.nodes()) node.edges = node.edges.filter((e) => graph.getNode(e.targetId));
}
function pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph) {
    const seedWorldX = frame.minX + frame.cols * frame.cellSize * 0.5;
    const seedWorldY = frame.minY + frame.rows * frame.cellSize * 0.5;
    pruneUnreachableRegions(navGraph, blocked, frame, graph, seedWorldX, seedWorldY);
}
export function buildFullRegionGraph(opts) {
    const { blocked, frame, navGraph, maxCellsPerChunk, minCellsPerChunk } = opts;
    const { cols, rows } = frame;
    const size = cols * rows;
    const cellToNode = new Int32Array(size).fill(-1);
    const distToWall = computeDistanceTransform(blocked, frame);
    const result = generateVoronoiRegions({ grid: blocked, distToWall, frame, maxCellsPerChunk, minCellsPerChunk, cellToNode, navGraph });
    const graph = HpaRegionGraph.fromVoronoiResult(result, frame);
    connectAllNodes(navGraph, blocked, frame, graph);
    pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph);
    return { ...graph.exportState(), graph };
}
export function rebuildDamagedRegionGraph(state, bounds, frame, blocked, navGraph) {
    const { maxCellsPerChunk, minCellsPerChunk, damagePadding = 12 } = state;
    const { cols, rows } = frame;
    if (!bounds || cols === 0 || rows === 0) return state;
    const graph = state.graph instanceof HpaRegionGraph ? state.graph : HpaRegionGraph.fromState(state, frame);
    graph.frame = frame;
    let distToWall = state.distToWall;
    const box = expandRegionDamageBounds(bounds, frame, damagePadding);
    stripBlockedCellsFromRegions(blocked, frame, box, graph);
    const { repackedIds, nodeIdCounter, distToWall: dist } = repackHullRegions(blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph, box);
    graph.nodeIdCounter = nodeIdCounter;
    graph.syncState(state);
    state.graph = graph;
    state.nodeIdCounter = nodeIdCounter;
    state.distToWall = dist;
    const reconnectIds = new Set(repackedIds);
    for (const id of graph.collectRegionIdsInBounds(box)) reconnectIds.add(id);
    for (const id of reconnectIds) reconnectRegionEdges(navGraph, blocked, frame, graph, graph.getNode(id));
    for (const node of graph.nodes()) validateRegionEdges(navGraph, frame, node, graph);
    pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph);
    graph.syncState(state);
    return state;
}
export function packRegionGraphFlat(nodesMap, cellToNode, frame) {
    const graph = nodesMap instanceof HpaRegionGraph ? nodesMap : new HpaRegionGraph(frame, nodesMap, cellToNode);
    const size = frame.cols * frame.rows;
    const cellToRegion = new Int16Array(size);
    cellToRegion.fill(REGION_CELL_UNASSIGNED);
    const idToIdx = new Int32Array(size);
    idToIdx.fill(-1);
    const nodes = Object.values(graph.nodesMap);
    const nodeCount = nodes.length;
    const nodeIdx = new Int32Array(nodeCount);
    const nodeIds = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];
        nodeIds[i] = node.id;
        idToIdx[node.id] = i;
        nodeIdx[i] = node.idx;
        for (let c = 0; c < node.cells.length; c++) cellToRegion[node.cells[c]] = i;
    }
    const edgeSources = [];
    const edgeTargets = [];
    const edgeCosts = [];
    for (let i = 0; i < nodeCount; i++) {
        const edges = nodes[i].edges;
        for (let e = 0; e < edges.length; e++) {
            const targetIdx = idToIdx[edges[e].targetId];
            if (targetIdx === -1) continue;
            edgeSources.push(i);
            edgeTargets.push(targetIdx);
            edgeCosts.push(edges[e].cost);
        }
    }
    return {
        nodeCount,
        nodeIdx,
        cellToRegion,
        edgeSources: Int16Array.from(edgeSources),
        edgeTargets: Int16Array.from(edgeTargets),
        edgeCosts: Uint16Array.from(edgeCosts),
        edgeWrite: edgeSources.length,
        nodeIds,
        idToIdx,
    };
}
export function unpackRegionGraphToNodes(cellToRegion, nodeIdx, nodeCount, frame) {
    const { cols, rows } = frame;
    const size = cols * rows;
    const cellToNode = new Int32Array(size).fill(-1);
    const nodesMap = {};
    for (let i = 0; i < nodeCount; i++) {
        const id = nodeIdx[i];
        const idx = nodeIdx[i];
        const node = new RegionNode(id, idx);
        node.cells = [];
        nodesMap[id] = node;
    }
    for (let idx = 0; idx < size; idx++) {
        const regionIdx = cellToRegion[idx];
        if (regionIdx < 0) continue;
        const node = nodesMap[nodeIdx[regionIdx]];
        cellToNode[idx] = node.idx;
        node.cells.push(idx);
    }
    return { nodesMap, cellToNode, nodeIdCounter: nodeCount };
}
