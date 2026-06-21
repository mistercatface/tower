import { bfsIndices } from "../DataStructures/gridBfs.js";
import { colRowToIndex, forEachCardinalNeighbor } from "../Spatial/grid/GridUtils.js";
import { findNearestOpenCellBlocked } from "./hpaPathRequest.js";
import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { worldToGridAtOrigin } from "../Spatial/grid/GridCoords.js";
import {
    RegionNode,
    computeDistanceTransform,
    generateVoronoiRegions,
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
/** @param {import("./VoronoiRegions.js").RegionNode} nodeA @param {import("./VoronoiRegions.js").RegionNode} nodeB */
function regionsShareDirectedPassableLink(navGraph, frame, nodeA, nodeB) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return false;
    const { cols, rows } = frame;
    const targetCells = new Set(nodeB.cells);
    for (let i = 0; i < nodeA.cells.length; i++) {
        const idx = nodeA.cells[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        let linked = false;
        forEachCardinalNeighbor(col, row, cols, rows, (nc, nr, nIdx) => {
            if (linked || !targetCells.has(nIdx)) return;
            if (navGraph.canStep(col, row, nc, nr)) linked = true;
        });
        if (linked) return true;
    }
    return false;
}
/** @param {import("./VoronoiRegions.js").RegionNode} node */
function validateRegionEdges(navGraph, frame, node, nodesMap) {
    if (!node) return;
    node.edges = node.edges.filter((edge) => {
        const other = nodesMap[edge.targetId];
        return other && regionsShareDirectedPassableLink(navGraph, frame, node, other);
    });
}
function connectRegionEdge(nodeA, nodeB) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return;
    const costAB = Math.max(Math.abs(nodeA.col - nodeB.col), Math.abs(nodeA.row - nodeB.row));
    if (costAB > 0 && !nodeA.edges.some((e) => e.targetId === nodeB.id)) nodeA.edges.push({ targetId: nodeB.id, cost: costAB });
}
function stripEdgesBetween(nodeA, nodeB) {
    if (!nodeA || !nodeB) return;
    nodeA.edges = nodeA.edges.filter((e) => e.targetId !== nodeB.id);
    nodeB.edges = nodeB.edges.filter((e) => e.targetId !== nodeA.id);
}
function reconnectRegionEdges(navGraph, blocked, frame, node, cellToNode, nodesMap) {
    if (!node) return;
    const { cols, rows } = frame;
    for (const edge of [...node.edges]) stripEdgesBetween(node, nodesMap[edge.targetId]);
    for (const other of Object.values(nodesMap)) if (other.id !== node.id) other.edges = other.edges.filter((edge) => edge.targetId !== node.id);
    const neighborIds = new Set();
    const nodeCells = node.cells;
    for (let i = 0; i < nodeCells.length; i++) {
        const idx = nodeCells[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        forEachCardinalNeighbor(col, row, cols, rows, (nc, nr, nIdx) => {
            if (blocked[nIdx]) return;
            if (!navGraph.canStep(col, row, nc, nr) && !navGraph.canStep(nc, nr, col, row)) return;
            const other = cellToNode[nIdx];
            if (other && other.id !== node.id) neighborIds.add(other.id);
        });
    }
    for (const otherId of neighborIds) {
        const other = nodesMap[otherId];
        if (!other) continue;
        if (regionsShareDirectedPassableLink(navGraph, frame, node, other)) connectRegionEdge(node, other);
        if (regionsShareDirectedPassableLink(navGraph, frame, other, node)) connectRegionEdge(other, node);
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
function createRegionFromCells(cells, blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, cellToNode, nodesMap, nodeIdCounter) {
    const { cols, rows, minX, minY, cellSize } = frame;
    if (cells.length === 0) return { newIds: [], nodeIdCounter };
    if (!distToWall || distToWall.length !== cols * rows) distToWall = computeDistanceTransform(blocked, frame, distToWall);
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
        floodFillRegion(startIdx, node, blocked, frame, cellToNode, node.cells, maxCellsPerChunk, navGraph, unassigned);
        repositionNodeCentroid(node, cellToNode, blocked, frame);
        newIds.push(id);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(nodesMap, cellToNode, frame, minCellsPerChunk, navGraph);
    repositionRegionCentroids(nodesMap, blocked, frame, cellToNode);
    return { newIds, nodeIdCounter, distToWall };
}
function stripBlockedCellsFromRegions(blocked, frame, startCol, endCol, startRow, endRow, cellToNode, nodesMap) {
    const { cols } = frame;
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
        repositionNodeCentroid(node, cellToNode, blocked, frame);
    }
}
function repackHullRegions(blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, cellToNode, nodesMap, nodeIdCounter, startCol, endCol, startRow, endRow) {
    const { cols } = frame;
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
    distToWall = computeDistanceTransform(blocked, frame, distToWall);
    const {
        newIds,
        nodeIdCounter: nextCounter,
        distToWall: dist,
    } = createRegionFromCells([...cells], blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, cellToNode, nodesMap, nodeIdCounter);
    return { repackedIds: newIds, nodeIdCounter: nextCounter, distToWall: dist };
}
function connectAllNodes(navGraph, blocked, frame, cellToNode, nodesMap) {
    for (const node of Object.values(nodesMap)) node.edges = [];
    const { cols, rows } = frame;
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
            const idx = colRowToIndex(col, row, cols);
            const node = cellToNode[idx];
            if (!node) continue;
            if (col + 1 < cols) {
                const right = cellToNode[idx + 1];
                if (right && right.id !== node.id) {
                    if (navGraph.canStep(col, row, col + 1, row)) connectRegionEdge(node, right);
                    if (navGraph.canStep(col + 1, row, col, row)) connectRegionEdge(right, node);
                }
            }
            if (row + 1 < rows) {
                const down = cellToNode[idx + cols];
                if (down && down.id !== node.id) {
                    if (navGraph.canStep(col, row, col, row + 1)) connectRegionEdge(node, down);
                    if (navGraph.canStep(col, row + 1, col, row)) connectRegionEdge(down, node);
                }
            }
        }
    for (const id in nodesMap) validateRegionEdges(navGraph, frame, nodesMap[id], nodesMap);
}
function pruneUnreachableRegions(navGraph, blocked, frame, cellToNode, nodesMap, seedWorldX, seedWorldY) {
    const { cols, rows, minX, minY, cellSize } = frame;
    const { col, row } = worldToGridAtOrigin(seedWorldX, seedWorldY, minX, minY, cellSize);
    const start = findNearestOpenCellBlocked(blocked, cols, rows, col, row);
    const startIdx = colRowToIndex(start.col, start.row, cols);
    const reachable = new Uint8Array(cols * rows);
    reachable[startIdx] = 1;
    bfsIndices([startIdx], (idx, enqueue) => {
        const c = idx % cols;
        const r = (idx / cols) | 0;
        forEachCardinalNeighbor(c, r, cols, rows, (nc, nr, nIdx) => {
            if (blocked[nIdx] || reachable[nIdx]) return;
            if (!navGraph.canStep(c, r, nc, nr)) return;
            reachable[nIdx] = 1;
            enqueue(nIdx);
        });
    });
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
    const { cols, rows } = frame;
    const size = cols * rows;
    const cellToNode = new Array(size).fill(null);
    const distToWall = computeDistanceTransform(blocked, frame);
    const result = generateVoronoiRegions({ grid: blocked, distToWall, frame, maxCellsPerChunk, minCellsPerChunk, cellToNode, navGraph });
    connectAllNodes(navGraph, blocked, frame, result.cellToNode, result.nodesMap);
    if (seedWorldX != null && seedWorldY != null) pruneUnreachableRegions(navGraph, blocked, frame, result.cellToNode, result.nodesMap, seedWorldX, seedWorldY);
    return { nodesMap: result.nodesMap, cellToNode: result.cellToNode, nodeIdCounter: result.nodeIdCounter };
}
/**
 * @param {{
 *   nodesMap: Record<string, import("./VoronoiRegions.js").RegionNode>,
 *   cellToNode: Array<import("./VoronoiRegions.js").RegionNode | null>,
 *   nodeIdCounter: number,
 *   maxCellsPerChunk: number,
 *   minCellsPerChunk: number,
 *   damagePadding?: number,
 *   seedWorldX?: number | null,
 *   seedWorldY?: number | null,
 *   distToWall?: Float32Array | null,
 * }} state
 * @param {import("../DataStructures/CellRect.js").CellBounds} bounds
 * @param {import("./GridNavSnapshot.js").GridFrame} frame
 * @param {Uint8Array} blocked
 * @param {{ canStep: (fromCol: number, fromRow: number, toCol: number, toRow: number) => boolean }} navGraph
 */
export function rebuildDamagedRegionGraph(state, bounds, frame, blocked, navGraph) {
    const { maxCellsPerChunk, minCellsPerChunk, damagePadding = 12, seedWorldX = null, seedWorldY = null } = state;
    const { cols, rows } = frame;
    if (!bounds || cols === 0 || rows === 0) return state;
    let distToWall = state.distToWall;
    const box = expandRegionDamageBounds(bounds, frame, damagePadding);
    stripBlockedCellsFromRegions(blocked, frame, box.startCol, box.endCol, box.startRow, box.endRow, state.cellToNode, state.nodesMap);
    const {
        repackedIds,
        nodeIdCounter,
        distToWall: dist,
    } = repackHullRegions(
        blocked,
        frame,
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
    for (const id of reconnectIds) reconnectRegionEdges(navGraph, blocked, frame, state.nodesMap[id], state.cellToNode, state.nodesMap);
    for (const id in state.nodesMap) validateRegionEdges(navGraph, frame, state.nodesMap[id], state.nodesMap);
    if (seedWorldX != null && seedWorldY != null) pruneUnreachableRegions(navGraph, blocked, frame, state.cellToNode, state.nodesMap, seedWorldX, seedWorldY);
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
