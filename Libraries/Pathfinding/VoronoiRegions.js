import { bfsColRowQueue, bfsIndices } from "../DataStructures/gridBfs.js";
import { CARDINAL_OFFSETS, OCTILE_OFFSETS, makeAdjacencyKey, forEachCardinalNeighbor, forEachCardinalNeighborIdx } from "../Spatial/grid/GridUtils.js";
export class RegionNode {
    constructor(id, idx) {
        this.id = id;
        this.idx = idx;
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
    cellToNode[startIdx] = node.idx;
    nodeCells.push(startIdx);
    cellCount++;
    bfsIndices([startIdx], (currIdx, enqueue) => {
        if (cellCount >= maxCellsPerChunk) return;
        forEachCardinalNeighborIdx(currIdx, cols, rows, (nIdx) => {
            if (navGraph && (!navGraph.canStepIdx(currIdx, nIdx) || !navGraph.canStepIdx(nIdx, currIdx))) return;
            if (grid[nIdx] === 0 && cellToNode[nIdx] === -1 && (!unassigned || unassigned.has(nIdx))) {
                if (unassigned) unassigned.delete(nIdx);
                cellToNode[nIdx] = node.idx;
                nodeCells.push(nIdx);
                enqueue(nIdx);
                cellCount++;
                if (cellCount >= maxCellsPerChunk) return;
            }
        });
    });
}
export function findRegionAdjacenciesInBox(cellToNode, frame, startCol, endCol, startRow, endRow, navGraph = null) {
    const { cols } = frame;
    const adjacencies = new Set();
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = r * cols + c;
            const nodeAIdx = cellToNode[idx];
            if (nodeAIdx === -1) continue;
            if (c + 1 <= endCol) {
                const nodeBIdx = cellToNode[idx + 1];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + 1) || navGraph.canStepIdx(idx + 1, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
            if (r + 1 <= endRow) {
                const nodeBIdx = cellToNode[idx + cols];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + cols) || navGraph.canStepIdx(idx + cols, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
        }
    return adjacencies;
}
export function mergeSmallRegions(nodesMap, cellToNode, frame, minCellsPerChunk, navGraph = null) {
    const { cols, rows } = frame;
    let merged;
    do {
        merged = false;
        for (const idStr of Object.keys(nodesMap)) {
            const id = Number(idStr);
            const node = nodesMap[id];
            if (!node) continue;
            const nodeCells = node.cells;
            if (!nodeCells || nodeCells.length === 0 || nodeCells.length >= minCellsPerChunk) continue;
            let neighborNode = null;
            for (let i = 0; i < nodeCells.length; i++) {
                const cellIdx = nodeCells[i];
                forEachCardinalNeighborIdx(cellIdx, cols, rows, (nIdx) => {
                    if (neighborNode) return;
                    const nNodeIdx = cellToNode[nIdx];
                    if (nNodeIdx !== -1 && nNodeIdx !== node.idx) {
                        const nNode = nodesMap[nNodeIdx];
                        if (nNode && (!navGraph || (navGraph.canStepIdx(cellIdx, nIdx) && navGraph.canStepIdx(nIdx, cellIdx)))) neighborNode = nNode;
                    }
                });
                if (neighborNode) break;
            }
            if (neighborNode) {
                const targetCells = neighborNode.cells;
                for (let i = 0; i < nodeCells.length; i++) {
                    const cellIdx = nodeCells[i];
                    cellToNode[cellIdx] = neighborNode.idx;
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
    const { cols } = frame;
    for (const idStr of Object.keys(nodesMap)) {
        const id = Number(idStr);
        const node = nodesMap[id];
        if (!node) continue;
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
        const startIdx = node.idx;
        const centroidIdx = Math.floor(sumRow / count) * cols + Math.floor(sumCol / count);
        const finalIdx = grid[centroidIdx] || cellToNode[centroidIdx] !== node.idx ? startIdx : centroidIdx;
        if (finalIdx !== startIdx) {
            node.idx = finalIdx;
            const newId = finalIdx; // Pure integer ID
            node.id = newId;
            delete nodesMap[id];
            nodesMap[newId] = node;
            for (let i = 0; i < nodeCells.length; i++) cellToNode[nodeCells[i]] = finalIdx;
        }
    }
}
export function generateVoronoiRegions({ grid, distToWall, frame, maxCellsPerChunk, minCellsPerChunk, cellToNode = null, navGraph = null }) {
    const { cols, rows } = frame;
    const size = cols * rows;
    const assignment = cellToNode ?? new Int32Array(size).fill(-1);
    assignment.fill(-1);
    const nodesMap = {};
    const emptyCells = [];
    for (let i = 0; i < size; i++) if (grid[i] === 0) emptyCells.push(i);
    emptyCells.sort((a, b) => distToWall[b] - distToWall[a]);
    for (const startIdx of emptyCells) {
        if (assignment[startIdx] !== -1) continue;
        const id = startIdx; // Pure integer ID
        const node = new RegionNode(id, startIdx);
        nodesMap[id] = node;
        floodFillRegion(startIdx, node, grid, frame, assignment, node.cells, maxCellsPerChunk, navGraph);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(nodesMap, assignment, frame, minCellsPerChunk, navGraph);
    repositionRegionCentroids(nodesMap, grid, frame, assignment);
    return { nodesMap, cellToNode: assignment };
}
export function repositionNodeCentroid(node, cellToNode, grid, frame, nodesMap = null) {
    const { cols } = frame;
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
    const centroidIdx = Math.floor(sumRow / count) * cols + Math.floor(sumCol / count);
    const finalIdx = grid[centroidIdx] || cellToNode[centroidIdx] !== node.idx ? nodeCells[0] : centroidIdx;
    if (finalIdx !== node.idx) {
        const oldId = node.id;
        node.idx = finalIdx;
        const newId = finalIdx; // Pure integer ID
        node.id = newId;
        if (nodesMap) {
            delete nodesMap[oldId];
            nodesMap[newId] = node;
        }
        for (let i = 0; i < nodeCells.length; i++) cellToNode[nodeCells[i]] = finalIdx;
    }
}
export function findRegionAdjacencies(cellToNode, grid, frame, navGraph = null) {
    const { cols, rows } = frame;
    const adjacencies = new Set();
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const nodeAIdx = cellToNode[idx];
            if (nodeAIdx === -1) continue;
            if (c + 1 < cols) {
                const nodeBIdx = cellToNode[idx + 1];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + 1) || navGraph.canStepIdx(idx + 1, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
            if (r + 1 < rows) {
                const nodeBIdx = cellToNode[idx + cols];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + cols) || navGraph.canStepIdx(idx + cols, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
        }
    return adjacencies;
}
