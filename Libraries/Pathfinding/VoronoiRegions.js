import { bfsColRowQueue, bfsIndices } from "../DataStructures/gridBfs.js";
import { CARDINAL_OFFSETS, OCTILE_OFFSETS, makeAdjacencyKey, forEachCardinalNeighbor, forEachCardinalNeighborIdx } from "../Spatial/grid/GridUtils.js";
export class RegionNode {
    constructor(id, col, row, sectorCol, sectorRow, minX, minY, cellSize) {
        this.id = id;
        this.col = col;
        this.row = row;
        this.sectorCol = sectorCol;
        this.sectorRow = sectorRow;
        this.x = minX + col * cellSize + cellSize / 2;
        this.y = minY + row * cellSize + cellSize / 2;
        this.edges = [];
        this.cells = [];
    }
}
export function computeDistanceTransform(grid, frame, distToWall = null) {
    const { cols, rows } = frame;
    const size = cols * rows;
    const distances = distToWall ?? new Float32Array(size);
    distances.fill(Infinity);
    const queue = [];
    for (let i = 0; i < size; i++)
        if (grid[i]) {
            distances[i] = 0;
            const col = i % cols;
            const row = (i / cols) | 0;
            queue.push(col, row);
        }
    bfsColRowQueue(queue, (c, r, enqueue) => {
        const currIdx = r * cols + c;
        const currDist = distances[currIdx];
        for (const { dc, dr, cost } of OCTILE_OFFSETS) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
                const nextDist = currDist + cost;
                if (nextDist < distances[nIdx]) {
                    distances[nIdx] = nextDist;
                    enqueue(nc, nr);
                }
            }
        }
    });
    for (let i = 0; i < size; i++) if (distances[i] === Infinity) distances[i] = 1000;
    return distances;
}
export function floodFillRegion(startIdx, node, grid, frame, cellToNode, nodeCells, maxCellsPerChunk, navGraph, unassigned = null) {
    const { cols, rows } = frame;
    let cellCount = 0;
    cellToNode[startIdx] = node;
    nodeCells.push(startIdx);
    cellCount++;
    bfsIndices([startIdx], (currIdx, enqueue) => {
        if (cellCount >= maxCellsPerChunk) return;
        forEachCardinalNeighborIdx(currIdx, cols, rows, (nIdx) => {
            if (navGraph && (!navGraph.canStepIdx(currIdx, nIdx) || !navGraph.canStepIdx(nIdx, currIdx))) return;
            if (grid[nIdx] === 0 && cellToNode[nIdx] === null && (!unassigned || unassigned.has(nIdx))) {
                if (unassigned) unassigned.delete(nIdx);
                cellToNode[nIdx] = node;
                nodeCells.push(nIdx);
                enqueue(nIdx);
                cellCount++;
                if (cellCount >= maxCellsPerChunk) return;
            }
        });
    });
}
export function mergeSmallRegions(nodesMap, cellToNode, frame, minCellsPerChunk, navGraph = null) {
    const { cols, rows } = frame;
    let merged;
    do {
        merged = false;
        for (const id of Object.keys(nodesMap)) {
            const node = nodesMap[id];
            if (!node) continue;
            const nodeCells = node.cells;
            if (!nodeCells || nodeCells.length === 0 || nodeCells.length >= minCellsPerChunk) continue;
            let neighborNode = null;
            for (let i = 0; i < nodeCells.length; i++) {
                const cellIdx = nodeCells[i];
                forEachCardinalNeighborIdx(cellIdx, cols, rows, (nIdx) => {
                    if (neighborNode) return;
                    const nNode = cellToNode[nIdx];
                    if (nNode && nNode.id !== id) if (!navGraph || (navGraph.canStepIdx(cellIdx, nIdx) && navGraph.canStepIdx(nIdx, cellIdx))) neighborNode = nNode;
                });
                if (neighborNode) break;
            }
            if (neighborNode) {
                const targetCells = neighborNode.cells;
                for (let i = 0; i < nodeCells.length; i++) {
                    const cellIdx = nodeCells[i];
                    cellToNode[cellIdx] = neighborNode;
                    targetCells.push(cellIdx);
                }
                node.cells = [];
                delete nodesMap[id];
                merged = true;
            }
        }
    } while (merged);
}
export function repositionRegionCentroids(nodesMap, grid, frame, cellToNode) {
    const { cols, rows, minX, minY, cellSize } = frame;
    for (const id in nodesMap) {
        const node = nodesMap[id];
        const nodeCells = node.cells;
        if (!nodeCells || nodeCells.length === 0) continue;
        let sumCol = 0;
        let sumRow = 0;
        const count = nodeCells.length;
        for (let i = 0; i < count; i++) {
            const cellIdx = nodeCells[i];
            sumCol += cellIdx % cols;
            sumRow += (cellIdx / cols) | 0;
        }
        const startCol = node.col;
        const startRow = node.row;
        node.col = Math.floor(sumCol / count);
        node.row = Math.floor(sumRow / count);
        const centroidIdx = node.row * cols + node.col;
        if (grid[centroidIdx] || cellToNode[centroidIdx]?.id !== node.id) {
            node.col = startCol;
            node.row = startRow;
        }
        node.x = minX + node.col * cellSize + cellSize / 2;
        node.y = minY + node.row * cellSize + cellSize / 2;
    }
}
export function generateVoronoiRegions({ grid, distToWall, frame, maxCellsPerChunk, minCellsPerChunk, cellToNode = null, navGraph = null }) {
    const { cols, rows, minX, minY, cellSize } = frame;
    const size = cols * rows;
    const assignment = cellToNode ?? new Array(size).fill(null);
    assignment.fill(null);
    const nodesMap = {};
    let nodeIdCounter = 0;
    const emptyCells = [];
    for (let i = 0; i < size; i++) if (grid[i] === 0) emptyCells.push(i);
    emptyCells.sort((a, b) => distToWall[b] - distToWall[a]);
    for (const startIdx of emptyCells) {
        if (assignment[startIdx] !== null) continue;
        const startCol = startIdx % cols;
        const startRow = (startIdx / cols) | 0;
        const id = `node_${++nodeIdCounter}`;
        const node = new RegionNode(id, startCol, startRow, startCol, startRow, minX, minY, cellSize);
        nodesMap[id] = node;
        floodFillRegion(startIdx, node, grid, frame, assignment, node.cells, maxCellsPerChunk, navGraph);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(nodesMap, assignment, frame, minCellsPerChunk, navGraph);
    repositionRegionCentroids(nodesMap, grid, frame, assignment);
    return { nodesMap, cellToNode: assignment, nodeIdCounter };
}
export function findRegionAdjacenciesInBox(cellToNode, frame, startCol, endCol, startRow, endRow, navGraph = null) {
    const { cols, rows } = frame;
    const adjacencies = new Set();
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = r * cols + c;
            const nodeA = cellToNode[idx];
            if (!nodeA) continue;
            if (c + 1 <= endCol) {
                const nodeB = cellToNode[idx + 1];
                if (nodeB && nodeA.id !== nodeB.id && (!navGraph || navGraph.canStepIdx(idx, idx + 1) || navGraph.canStepIdx(idx + 1, idx))) adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
            }
            if (r + 1 <= endRow) {
                const nodeB = cellToNode[idx + cols];
                if (nodeB && nodeA.id !== nodeB.id && (!navGraph || navGraph.canStepIdx(idx, idx + cols) || navGraph.canStepIdx(idx + cols, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
            }
        }
    return adjacencies;
}
export function repositionNodeCentroid(node, cellToNode, grid, frame) {
    const { cols, rows, minX, minY, cellSize } = frame;
    const nodeCells = node.cells;
    const count = nodeCells.length;
    if (count === 0) return;
    let sumCol = 0;
    let sumRow = 0;
    for (let i = 0; i < count; i++) {
        const idx = nodeCells[i];
        sumCol += idx % cols;
        sumRow += (idx / cols) | 0;
    }
    node.col = Math.floor(sumCol / count);
    node.row = Math.floor(sumRow / count);
    const centroidIdx = node.row * cols + node.col;
    if (grid[centroidIdx] || cellToNode[centroidIdx]?.id !== node.id) {
        const anchorIdx = nodeCells[0];
        node.col = anchorIdx % cols;
        node.row = (anchorIdx / cols) | 0;
    }
    node.x = minX + node.col * cellSize + cellSize / 2;
    node.y = minY + node.row * cellSize + cellSize / 2;
}
export function findRegionAdjacencies(cellToNode, grid, frame, navGraph = null) {
    const { cols, rows } = frame;
    const adjacencies = new Set();
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const nodeA = cellToNode[idx];
            if (!nodeA) continue;
            if (c + 1 < cols) {
                const nodeB = cellToNode[idx + 1];
                if (nodeB && nodeA.id !== nodeB.id && (!navGraph || navGraph.canStepIdx(idx, idx + 1) || navGraph.canStepIdx(idx + 1, idx))) adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
            }
            if (r + 1 < rows) {
                const nodeB = cellToNode[idx + cols];
                if (nodeB && nodeA.id !== nodeB.id && (!navGraph || navGraph.canStepIdx(idx, idx + cols) || navGraph.canStepIdx(idx + cols, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
            }
        }
    return adjacencies;
}
