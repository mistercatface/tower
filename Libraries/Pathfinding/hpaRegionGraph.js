import { bfsIndices } from "../DataStructures/gridBfs.js";
import { colRowToIndex, forEachCardinalNeighbor, forEachCardinalNeighborIdx } from "../Spatial/grid/GridUtils.js";
import { findNearestOpenCellBlocked } from "./hpaPathRequest.js";
import { cellBoundsForGrid, forEachDenseCellInBounds, padCellBoundsToGrid } from "../DataStructures/CellRect.js";
import { snapshotWorldToGrid } from "./GridNavSnapshot.js";
import { RegionNode, computeDistanceTransform, generateVoronoiRegions, repositionNodeCentroid, repositionRegionCentroids, mergeSmallRegions, floodFillRegion } from "./VoronoiRegions.js";
export const REGION_CELL_UNASSIGNED = -1;
export class HpaRegionGraph {
    constructor(frame, nodesMap = {}, cellToNode = null, nodeIdCounter = 0) {
        this.frame = frame;
        this.nodesMap = nodesMap;
        this.cellToNode = cellToNode ?? new Array(frame.cols * frame.rows).fill(null);
        this.nodeIdCounter = nodeIdCounter;
    }
    static fromState(state, frame) {
        return new HpaRegionGraph(frame, state.nodesMap, state.cellToNode, state.nodeIdCounter);
    }
    static fromVoronoiResult(result, frame) {
        return new HpaRegionGraph(frame, result.nodesMap, result.cellToNode, result.nodeIdCounter);
    }
    exportState() {
        return { nodesMap: this.nodesMap, cellToNode: this.cellToNode, nodeIdCounter: this.nodeIdCounter };
    }
    nextNodeId() {
        return `node_${++this.nodeIdCounter}`;
    }
    createRegionAtCell(startIdx) {
        const { cols, minX, minY, cellSize } = this.frame;
        const startCol = startIdx % cols;
        const startRow = (startIdx / cols) | 0;
        const node = new RegionNode(this.nextNodeId(), startCol, startRow, startCol, startRow, minX, minY, cellSize);
        this.nodesMap[node.id] = node;
        return node;
    }
    getNode(id) {
        return this.nodesMap[id] ?? null;
    }
    nodeForCell(idx) {
        return this.cellToNode[idx] ?? null;
    }
    assignCell(node, idx) {
        if (!node) return;
        this.cellToNode[idx] = node;
        node.cells.push(idx);
    }
    unassignCell(idx) {
        this.cellToNode[idx] = null;
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
        const costAB = Math.max(Math.abs(nodeA.col - nodeB.col), Math.abs(nodeA.row - nodeB.row));
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
    removeRegion(nodeOrId) {
        const node = typeof nodeOrId === "string" ? this.getNode(nodeOrId) : nodeOrId;
        if (!node) return;
        for (let i = 0; i < node.cells.length; i++) this.cellToNode[node.cells[i]] = null;
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
/** @param {import("../DataStructures/CellRect.js").CellBounds} bounds @param {import("./GridNavSnapshot.js").GridFrame} frame @param {number} [padding] */
export function expandRegionDamageBounds(bounds, frame, padding = 12) {
    return padCellBoundsToGrid(bounds, frame.cols, frame.rows, padding);
}
/** @param {import("./VoronoiRegions.js").RegionNode} nodeA @param {import("./VoronoiRegions.js").RegionNode} nodeB */
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
/** @param {import("./VoronoiRegions.js").RegionNode} node */
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
    const { cols, rows, minX, minY, cellSize } = frame;
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
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame);
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
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame);
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
    const start = findNearestOpenCellBlocked(blocked, cols, rows, col, row);
    const startIdx = colRowToIndex(start.col, start.row, cols);
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
/**
 * @param {{
 *   blocked: Uint8Array,
 *   frame: import("./GridNavSnapshot.js").GridFrame,
 *   navGraph: object,
 *   maxCellsPerChunk: number,
 *   minCellsPerChunk: number,
 * }} opts
 */
export function buildFullRegionGraph(opts) {
    const { blocked, frame, navGraph, maxCellsPerChunk, minCellsPerChunk } = opts;
    const { cols, rows } = frame;
    const size = cols * rows;
    const cellToNode = new Array(size).fill(null);
    const distToWall = computeDistanceTransform(blocked, frame);
    const result = generateVoronoiRegions({ grid: blocked, distToWall, frame, maxCellsPerChunk, minCellsPerChunk, cellToNode, navGraph });
    const graph = HpaRegionGraph.fromVoronoiResult(result, frame);
    connectAllNodes(navGraph, blocked, frame, graph);
    pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph);
    return { ...graph.exportState(), graph };
}
/**
 * @param {{
 *   nodesMap: Record<string, import("./VoronoiRegions.js").RegionNode>,
 *   cellToNode: Array<import("./VoronoiRegions.js").RegionNode | null>,
 *   nodeIdCounter: number,
 *   maxCellsPerChunk: number,
 *   minCellsPerChunk: number,
 *   damagePadding?: number,
 *   distToWall?: Float32Array | null,
 * }} state
 * @param {import("../DataStructures/CellRect.js").CellBounds} bounds
 * @param {import("./GridNavSnapshot.js").GridFrame} frame
 * @param {Uint8Array} blocked
 * @param {{ canStep: (fromCol: number, fromRow: number, toCol: number, toRow: number) => boolean }} navGraph
 */
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
/** @param {Record<string, import("./VoronoiRegions.js").RegionNode> | HpaRegionGraph} nodesMap @param {Array<import("./VoronoiRegions.js").RegionNode | null>} cellToNode @param {import("./GridNavSnapshot.js").GridFrame} frame */
export function packRegionGraphFlat(nodesMap, cellToNode, frame) {
    const graph = nodesMap instanceof HpaRegionGraph ? nodesMap : new HpaRegionGraph(frame, nodesMap, cellToNode);
    const size = frame.cols * frame.rows;
    const cellToRegion = new Int16Array(size);
    cellToRegion.fill(REGION_CELL_UNASSIGNED);
    const nodeIds = graph
        .nodeIds()
        .filter((id) => !id.startsWith("__hpa_"))
        .sort();
    const nodeCount = nodeIds.length;
    const idToIdx = new Map();
    const nodeIdx = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        idToIdx.set(nodeIds[i], i);
        const node = graph.getNode(nodeIds[i]);
        nodeIdx[i] = node.col + node.row * frame.cols;
        for (let c = 0; c < node.cells.length; c++) cellToRegion[node.cells[c]] = i;
    }
    const edgeSources = [];
    const edgeTargets = [];
    const edgeCosts = [];
    for (let i = 0; i < nodeCount; i++) {
        const edges = graph.getNode(nodeIds[i]).edges;
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
/** @param {Int16Array} cellToRegion @param {Int32Array} nodeIdx @param {number} nodeCount @param {import("./GridNavSnapshot.js").GridFrame} frame */
export function unpackRegionGraphToNodes(cellToRegion, nodeIdx, nodeCount, frame) {
    const { cols, rows, minX, minY, cellSize } = frame;
    const size = cols * rows;
    const cellToNode = new Array(size).fill(null);
    const nodesMap = {};
    for (let i = 0; i < nodeCount; i++) {
        const id = `node_${i}`;
        const idx = nodeIdx[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const node = new RegionNode(id, col, row, col, row, minX, minY, cellSize);
        node.cells = [];
        nodesMap[id] = node;
    }
    for (let idx = 0; idx < size; idx++) {
        const regionIdx = cellToRegion[idx];
        if (regionIdx < 0) continue;
        const node = nodesMap[`node_${regionIdx}`];
        cellToNode[idx] = node;
        node.cells.push(idx);
    }
    return { nodesMap, cellToNode, nodeIdCounter: nodeCount };
}
