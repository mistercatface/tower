import { colRowToIndex, forEachCardinalNeighbor, makeAdjacencyKey } from "../Spatial/grid/GridUtils.js";
import { findNearestOpenCellBlocked } from "./hpaPathRequest.js";
import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { worldToGridAtOrigin } from "../Spatial/grid/GridCoords.js";
import {
    RegionNode,
    computeDistanceTransform,
    generateVoronoiRegions,
    findRegionAdjacencies,
    repositionNodeCentroid,
    repositionRegionCentroids,
    mergeSmallRegions,
    floodFillRegion,
} from "./VoronoiRegions.js";
export const REGION_CELL_UNASSIGNED = -1;
/** @param {import("../DataStructures/CellRect.js").CellBounds} bounds @param {import("./GridNavSnapshot.js").GridFrame} frame @param {number} [padding] */
export function expandRegionDamageBounds(bounds, frame, padding = 12) {
    return {
        startCol: Math.max(0, bounds.startCol - padding),
        endCol: Math.min(frame.cols - 1, bounds.endCol + padding),
        startRow: Math.max(0, bounds.startRow - padding),
        endRow: Math.min(frame.rows - 1, bounds.endRow + padding),
    };
}
/**
 * @param {Uint8Array} blocked
 * @param {number} cols
 * @param {number} rows
 * @param {object} navGraph
 */
function canWalkBetween(navGraph, fromCol, fromRow, toCol, toRow) {
    return navGraph.canStep(fromCol, fromRow, toCol, toRow) || navGraph.canStep(toCol, toRow, fromCol, fromRow);
}
/** @param {import("./VoronoiRegions.js").RegionNode} nodeA @param {import("./VoronoiRegions.js").RegionNode} nodeB */
function regionsSharePassableLink(navGraph, cols, rows, blocked, nodeA, nodeB, nodesMap) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return false;
    const targetCells = new Set(nodeB.cells);
    for (let i = 0; i < nodeA.cells.length; i++) {
        const idx = nodeA.cells[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        let linked = false;
        forEachCardinalNeighbor(col, row, cols, rows, (nc, nr, nIdx) => {
            if (linked || !targetCells.has(nIdx)) return;
            if (canWalkBetween(navGraph, col, row, nc, nr)) linked = true;
        });
        if (linked) return true;
    }
    return false;
}
/** @param {import("./VoronoiRegions.js").RegionNode} node */
function validateRegionEdges(navGraph, cols, rows, blocked, node, nodesMap) {
    if (!node) return;
    node.edges = node.edges.filter((edge) => {
        const other = nodesMap[edge.targetId];
        return other && regionsSharePassableLink(navGraph, cols, rows, blocked, node, other, nodesMap);
    });
}
function connectRegionPair(nodeA, nodeB) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return;
    const costAB = Math.max(Math.abs(nodeA.col - nodeB.col), Math.abs(nodeA.row - nodeB.row));
    if (costAB > 0 && !nodeA.edges.some((e) => e.targetId === nodeB.id)) nodeA.edges.push({ targetId: nodeB.id, cost: costAB });
    const costBA = Math.max(Math.abs(nodeB.col - nodeA.col), Math.abs(nodeB.row - nodeA.row));
    if (costBA > 0 && !nodeB.edges.some((e) => e.targetId === nodeA.id)) nodeB.edges.push({ targetId: nodeA.id, cost: costBA });
}
function stripEdgePair(nodeA, nodeB) {
    if (!nodeA || !nodeB) return;
    nodeA.edges = nodeA.edges.filter((e) => e.targetId !== nodeB.id);
    nodeB.edges = nodeB.edges.filter((e) => e.targetId !== nodeA.id);
}
function reconnectRegionEdges(navGraph, blocked, cols, rows, node, cellToNode, nodesMap) {
    if (!node) return;
    for (const edge of [...node.edges]) stripEdgePair(node, nodesMap[edge.targetId]);
    const neighborIds = new Set();
    const nodeCells = node.cells;
    for (let i = 0; i < nodeCells.length; i++) {
        const idx = nodeCells[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        forEachCardinalNeighbor(col, row, cols, rows, (nc, nr, nIdx) => {
            if (blocked[nIdx]) return;
            if (!canWalkBetween(navGraph, col, row, nc, nr)) return;
            const other = cellToNode[nIdx];
            if (other && other.id !== node.id) neighborIds.add(other.id);
        });
    }
    for (const otherId of neighborIds) {
        const other = nodesMap[otherId];
        if (other && regionsSharePassableLink(navGraph, cols, rows, blocked, node, other, nodesMap)) connectRegionPair(node, other);
    }
}
function collectRegionIdsInBox(cellToNode, cols, startCol, endCol, startRow, endRow) {
    const ids = new Set();
    forEachDenseCellInRect(startCol, endCol, startRow, endRow, cols, (_col, _row, idx) => {
        const node = cellToNode[idx];
        if (node) ids.add(node.id);
    });
    return ids;
}
function removeRegionNode(node, cellToNode, nodesMap) {
    if (!node) return;
    for (let i = 0; i < node.cells.length; i++) cellToNode[node.cells[i]] = null;
    const id = node.id;
    delete nodesMap[id];
    for (const otherId in nodesMap) nodesMap[otherId].edges = nodesMap[otherId].edges.filter((e) => e.targetId !== id);
}
function createRegionFromCells(cells, blocked, cols, rows, minX, minY, cellSize, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, cellToNode, nodesMap, nodeIdCounter) {
    if (cells.length === 0) return { newIds: [], nodeIdCounter };
    if (!distToWall || distToWall.length !== cols * rows) distToWall = computeDistanceTransform(blocked, cols, rows, distToWall);
    const unassigned = new Set(cells);
    const starts = [...unassigned].sort((a, b) => distToWall[b] - distToWall[a]);
    const newIds = [];
    for (let s = 0; s < starts.length; s++) {
        const startIdx = starts[s];
        if (!unassigned.has(startIdx)) continue;
        const startCol = startIdx % cols;
        const startRow = (startIdx / cols) | 0;
        const id = `node_${++nodeIdCounter}`;
        const node = new RegionNode(id, startCol, startRow, startCol, startRow, minX, minY, cellSize);
        nodesMap[id] = node;
        node.cells.length = 0;
        floodFillRegion(startIdx, node, blocked, cols, rows, cellToNode, node.cells, maxCellsPerChunk, navGraph, unassigned);
        repositionNodeCentroid(node, cellToNode, blocked, cols, rows, minX, minY, cellSize);
        newIds.push(id);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(nodesMap, cellToNode, cols, rows, minCellsPerChunk, navGraph);
    repositionRegionCentroids(nodesMap, blocked, cols, rows, minX, minY, cellSize, cellToNode);
    return { newIds, nodeIdCounter, distToWall };
}
function stripBlockedCellsFromRegions(blocked, cols, rows, minX, minY, cellSize, startCol, endCol, startRow, endRow, cellToNode, nodesMap) {
    const touched = new Set();
    forEachDenseCellInRect(startCol, endCol, startRow, endRow, cols, (_col, _row, idx) => {
        if (!blocked[idx]) return;
        const node = cellToNode[idx];
        if (!node) return;
        touched.add(node.id);
        node.cells = node.cells.filter((cellIdx) => cellIdx !== idx);
        cellToNode[idx] = null;
    });
    for (const id of [...touched]) {
        const node = nodesMap[id];
        if (!node) continue;
        if (node.cells.length === 0) {
            removeRegionNode(node, cellToNode, nodesMap);
            continue;
        }
        repositionNodeCentroid(node, cellToNode, blocked, cols, rows, minX, minY, cellSize);
    }
}
function repackHullRegions(
    blocked,
    cols,
    rows,
    minX,
    minY,
    cellSize,
    maxCellsPerChunk,
    minCellsPerChunk,
    navGraph,
    distToWall,
    cellToNode,
    nodesMap,
    nodeIdCounter,
    startCol,
    endCol,
    startRow,
    endRow,
) {
    const regionIds = collectRegionIdsInBox(cellToNode, cols, startCol, endCol, startRow, endRow);
    const cells = new Set();
    for (const id of regionIds) {
        const node = nodesMap[id];
        if (!node) continue;
        for (let i = 0; i < node.cells.length; i++) cells.add(node.cells[i]);
        removeRegionNode(node, cellToNode, nodesMap);
    }
    forEachDenseCellInRect(startCol, endCol, startRow, endRow, cols, (_col, _row, idx) => {
        if (!blocked[idx]) cells.add(idx);
    });
    if (cells.size === 0) return { repackedIds: [], nodeIdCounter, distToWall };
    distToWall = computeDistanceTransform(blocked, cols, rows, distToWall);
    const {
        newIds,
        nodeIdCounter: nextCounter,
        distToWall: dist,
    } = createRegionFromCells([...cells], blocked, cols, rows, minX, minY, cellSize, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, cellToNode, nodesMap, nodeIdCounter);
    return { repackedIds: newIds, nodeIdCounter: nextCounter, distToWall: dist };
}
function connectAllNodes(navGraph, blocked, cols, rows, cellToNode, nodesMap) {
    for (const node of Object.values(nodesMap)) node.edges = [];
    const adjacencies = findRegionAdjacencies(cellToNode, blocked, cols, rows, navGraph);
    for (const key of adjacencies) {
        const [idA, idB] = key.split(":");
        connectRegionPair(nodesMap[idA], nodesMap[idB]);
    }
    for (const id in nodesMap) validateRegionEdges(navGraph, cols, rows, blocked, nodesMap[id], nodesMap);
}
function pruneUnreachableRegions(navGraph, blocked, cols, rows, minX, minY, cellSize, cellToNode, nodesMap, seedWorldX, seedWorldY) {
    const { col, row } = worldToGridAtOrigin(seedWorldX, seedWorldY, minX, minY, cellSize);
    const start = findNearestOpenCellBlocked(blocked, cols, rows, col, row);
    const startIdx = colRowToIndex(start.col, start.row, cols);
    const reachable = new Uint8Array(cols * rows);
    const queue = [startIdx];
    reachable[startIdx] = 1;
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        const c = idx % cols;
        const r = (idx / cols) | 0;
        forEachCardinalNeighbor(c, r, cols, rows, (nc, nr, nIdx) => {
            if (blocked[nIdx] || reachable[nIdx]) return;
            if (!canWalkBetween(navGraph, c, r, nc, nr)) return;
            reachable[nIdx] = 1;
            queue.push(nIdx);
        });
    }
    for (const id in nodesMap) {
        const node = nodesMap[id];
        let hasReachableCell = false;
        for (let i = 0; i < node.cells.length; i++)
            if (reachable[node.cells[i]]) {
                hasReachableCell = true;
                break;
            }
        if (hasReachableCell) continue;
        removeRegionNode(node, cellToNode, nodesMap);
    }
    for (const id in nodesMap) nodesMap[id].edges = nodesMap[id].edges.filter((e) => nodesMap[e.targetId]);
}
/**
 * @param {{
 *   blocked: Uint8Array,
 *   frame: import("./GridNavSnapshot.js").GridFrame,
 *   navGraph: object,
 *   maxCellsPerChunk: number,
 *   minCellsPerChunk: number,
 *   seedWorldX?: number | null,
 *   seedWorldY?: number | null,
 * }} opts
 */
export function buildFullRegionGraph(opts) {
    const { blocked, frame, navGraph, maxCellsPerChunk, minCellsPerChunk, seedWorldX = null, seedWorldY = null } = opts;
    const { cols, rows, minX, minY, cellSize } = frame;
    const size = cols * rows;
    const cellToNode = new Array(size).fill(null);
    const distToWall = computeDistanceTransform(blocked, cols, rows);
    const result = generateVoronoiRegions({ grid: blocked, distToWall, cols, rows, minX, minY, cellSize, maxCellsPerChunk, minCellsPerChunk, cellToNode, navGraph });
    connectAllNodes(navGraph, blocked, cols, rows, result.cellToNode, result.nodesMap);
    if (seedWorldX != null && seedWorldY != null) pruneUnreachableRegions(navGraph, blocked, cols, rows, minX, minY, cellSize, result.cellToNode, result.nodesMap, seedWorldX, seedWorldY);
    return { nodesMap: result.nodesMap, cellToNode: result.cellToNode, nodeIdCounter: result.nodeIdCounter };
}
/**
 * @param {{
 *   nodesMap: Record<string, import("./VoronoiRegions.js").RegionNode>,
 *   cellToNode: Array<import("./VoronoiRegions.js").RegionNode | null>,
 *   nodeIdCounter: number,
 *   blocked: Uint8Array,
 *   navGraph: object,
 *   maxCellsPerChunk: number,
 *   minCellsPerChunk: number,
 *   damagePadding?: number,
 *   seedWorldX?: number | null,
 *   seedWorldY?: number | null,
 *   distToWall?: Float32Array | null,
 * }} state
 * @param {import("../DataStructures/CellRect.js").CellBounds} bounds
 * @param {import("./GridNavSnapshot.js").GridFrame} frame
 */
export function rebuildDamagedRegionGraph(state, bounds, frame) {
    const { blocked, navGraph, maxCellsPerChunk, minCellsPerChunk, damagePadding = 12, seedWorldX = null, seedWorldY = null } = state;
    const { cols, rows, minX, minY, cellSize } = frame;
    if (!bounds || cols === 0 || rows === 0) return state;
    let distToWall = state.distToWall;
    const box = expandRegionDamageBounds(bounds, frame, damagePadding);
    stripBlockedCellsFromRegions(blocked, cols, rows, minX, minY, cellSize, box.startCol, box.endCol, box.startRow, box.endRow, state.cellToNode, state.nodesMap);
    const {
        repackedIds,
        nodeIdCounter,
        distToWall: dist,
    } = repackHullRegions(
        blocked,
        cols,
        rows,
        minX,
        minY,
        cellSize,
        maxCellsPerChunk,
        minCellsPerChunk,
        navGraph,
        distToWall,
        state.cellToNode,
        state.nodesMap,
        state.nodeIdCounter,
        box.startCol,
        box.endCol,
        box.startRow,
        box.endRow,
    );
    state.nodeIdCounter = nodeIdCounter;
    state.distToWall = dist;
    const reconnectIds = new Set(repackedIds);
    for (const id of collectRegionIdsInBox(state.cellToNode, cols, box.startCol, box.endCol, box.startRow, box.endRow)) reconnectIds.add(id);
    for (const id of reconnectIds) reconnectRegionEdges(navGraph, blocked, cols, rows, state.nodesMap[id], state.cellToNode, state.nodesMap);
    for (const id in state.nodesMap) validateRegionEdges(navGraph, cols, rows, blocked, state.nodesMap[id], state.nodesMap);
    if (seedWorldX != null && seedWorldY != null) pruneUnreachableRegions(navGraph, blocked, cols, rows, minX, minY, cellSize, state.cellToNode, state.nodesMap, seedWorldX, seedWorldY);
    return state;
}
/** @param {Record<string, import("./VoronoiRegions.js").RegionNode>} nodesMap @param {Array<import("./VoronoiRegions.js").RegionNode | null>} cellToNode @param {import("./GridNavSnapshot.js").GridFrame} frame */
export function packRegionGraphFlat(nodesMap, cellToNode, frame) {
    const size = frame.cols * frame.rows;
    const cellToRegion = new Int16Array(size);
    cellToRegion.fill(REGION_CELL_UNASSIGNED);
    const nodeIds = Object.keys(nodesMap)
        .filter((id) => !id.startsWith("__hpa_"))
        .sort();
    const nodeCount = nodeIds.length;
    const idToIdx = new Map();
    const nodeCol = new Int16Array(nodeCount);
    const nodeRow = new Int16Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        idToIdx.set(nodeIds[i], i);
        const node = nodesMap[nodeIds[i]];
        nodeCol[i] = node.col;
        nodeRow[i] = node.row;
        for (let c = 0; c < node.cells.length; c++) cellToRegion[node.cells[c]] = i;
    }
    const edgeSources = [];
    const edgeTargets = [];
    const edgeCosts = [];
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
        cellToRegion,
        edgeSources: Int16Array.from(edgeSources),
        edgeTargets: Int16Array.from(edgeTargets),
        edgeCosts: Uint16Array.from(edgeCosts),
        edgeWrite: edgeSources.length,
        nodeIds,
        idToIdx,
    };
}
/** @param {Int16Array} cellToRegion @param {Int16Array} nodeCol @param {Int16Array} nodeRow @param {number} nodeCount @param {import("./GridNavSnapshot.js").GridFrame} frame */
export function unpackRegionGraphToNodes(cellToRegion, nodeCol, nodeRow, nodeCount, frame) {
    const { cols, rows, minX, minY, cellSize } = frame;
    const size = cols * rows;
    const cellToNode = new Array(size).fill(null);
    const nodesMap = {};
    for (let i = 0; i < nodeCount; i++) {
        const id = `node_${i}`;
        const node = new RegionNode(id, nodeCol[i], nodeRow[i], nodeCol[i], nodeRow[i], minX, minY, cellSize);
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
