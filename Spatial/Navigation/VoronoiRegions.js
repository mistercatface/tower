import {
    CARDINAL_OFFSETS,
    OCTILE_OFFSETS,
    colRowToIndex,
    indexToColRow,
    makeAdjacencyKey,
    forEachCardinalNeighbor,
} from "./GridUtils.js";

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
    }
}

export function computeDistanceTransform(grid, cols, rows, distToWall = null) {
    const size = cols * rows;
    const distances = distToWall ?? new Float32Array(size);
    distances.fill(Infinity);

    const queue = [];
    let head = 0;

    for (let i = 0; i < size; i++) {
        if (grid[i] === 1) {
            distances[i] = 0;
            const { col, row } = indexToColRow(i, cols);
            queue.push(col, row);
        }
    }

    while (head < queue.length) {
        const c = queue[head++];
        const r = queue[head++];
        const currIdx = colRowToIndex(c, r, cols);
        const currDist = distances[currIdx];

        for (const { dc, dr, cost } of OCTILE_OFFSETS) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = colRowToIndex(nc, nr, cols);
                const nextDist = currDist + cost;
                if (nextDist < distances[nIdx]) {
                    distances[nIdx] = nextDist;
                    queue.push(nc, nr);
                }
            }
        }
    }

    for (let i = 0; i < size; i++) {
        if (distances[i] === Infinity) {
            distances[i] = 1000;
        }
    }

    return distances;
}

function floodFillRegion(startIdx, node, grid, cols, rows, cellToNode, nodeCells, maxCellsPerChunk) {
    let cellCount = 0;
    const queue = [startIdx];
    cellToNode[startIdx] = node;
    nodeCells.push(startIdx);
    cellCount++;

    let head = 0;
    while (head < queue.length && cellCount < maxCellsPerChunk) {
        const currIdx = queue[head++];
        const { col: c, row: r } = indexToColRow(currIdx, cols);

        for (const { dc, dr } of CARDINAL_OFFSETS) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = colRowToIndex(nc, nr, cols);
                if (grid[nIdx] === 0 && cellToNode[nIdx] === null) {
                    cellToNode[nIdx] = node;
                    nodeCells.push(nIdx);
                    queue.push(nIdx);
                    cellCount++;
                    if (cellCount >= maxCellsPerChunk) break;
                }
            }
        }
    }
}

function mergeSmallRegions(nodesMap, nodeCellsMap, cellToNode, cols, rows, minCellsPerChunk) {
    let merged;
    do {
        merged = false;
        for (const id of Object.keys(nodesMap)) {
            if (!nodesMap[id]) continue;

            const nodeCells = nodeCellsMap.get(id);
            if (!nodeCells || nodeCells.length === 0 || nodeCells.length >= minCellsPerChunk) continue;

            let neighborNode = null;
            for (const cellIdx of nodeCells) {
                const { col, row } = indexToColRow(cellIdx, cols);
                forEachCardinalNeighbor(col, row, cols, rows, (nc, nr, nIdx) => {
                    if (neighborNode) return;
                    const nNode = cellToNode[nIdx];
                    if (nNode && nNode.id !== id) {
                        neighborNode = nNode;
                    }
                });
                if (neighborNode) break;
            }

            if (neighborNode) {
                const targetCells = nodeCellsMap.get(neighborNode.id);
                for (const cellIdx of nodeCells) {
                    cellToNode[cellIdx] = neighborNode;
                    targetCells.push(cellIdx);
                }
                nodeCellsMap.delete(id);
                delete nodesMap[id];
                merged = true;
            }
        }
    } while (merged);
}

function repositionRegionCentroids(nodesMap, nodeCellsMap, grid, cols, rows, minX, minY, cellSize, cellToNode) {
    for (const id in nodesMap) {
        const node = nodesMap[id];
        const nodeCells = nodeCellsMap.get(id);
        if (!nodeCells || nodeCells.length === 0) continue;

        let sumCol = 0;
        let sumRow = 0;
        for (const cellIdx of nodeCells) {
            const { col, row } = indexToColRow(cellIdx, cols);
            sumCol += col;
            sumRow += row;
        }

        const startCol = node.col;
        const startRow = node.row;

        node.col = Math.floor(sumCol / nodeCells.length);
        node.row = Math.floor(sumRow / nodeCells.length);

        const centroidIdx = colRowToIndex(node.col, node.row, cols);
        if (grid[centroidIdx] === 1 || cellToNode[centroidIdx]?.id !== node.id) {
            node.col = startCol;
            node.row = startRow;
        }

        node.x = minX + node.col * cellSize + cellSize / 2;
        node.y = minY + node.row * cellSize + cellSize / 2;
    }
}

export function generateVoronoiRegions({
    grid,
    distToWall,
    cols,
    rows,
    minX,
    minY,
    cellSize,
    maxCellsPerChunk,
    minCellsPerChunk,
    cellToNode = null,
}) {
    const size = cols * rows;
    const assignment = cellToNode ?? new Array(size).fill(null);
    assignment.fill(null);

    const nodesMap = {};
    const nodeCellsMap = new Map();
    let nodeIdCounter = 0;

    const emptyCells = [];
    for (let i = 0; i < size; i++) {
        if (grid[i] === 0) {
            emptyCells.push(i);
        }
    }
    emptyCells.sort((a, b) => distToWall[b] - distToWall[a]);

    for (const startIdx of emptyCells) {
        if (assignment[startIdx] !== null) continue;

        const { col: startCol, row: startRow } = indexToColRow(startIdx, cols);
        const id = `node_${++nodeIdCounter}`;
        const node = new RegionNode(id, startCol, startRow, startCol, startRow, minX, minY, cellSize);
        nodesMap[id] = node;

        const nodeCells = [];
        nodeCellsMap.set(id, nodeCells);
        floodFillRegion(startIdx, node, grid, cols, rows, assignment, nodeCells, maxCellsPerChunk);
    }

    if (minCellsPerChunk > 0) {
        mergeSmallRegions(nodesMap, nodeCellsMap, assignment, cols, rows, minCellsPerChunk);
    }

    repositionRegionCentroids(nodesMap, nodeCellsMap, grid, cols, rows, minX, minY, cellSize, assignment);

    return { nodesMap, cellToNode: assignment, nodeIdCounter };
}

export function findRegionAdjacenciesInBox(cellToNode, cols, rows, startCol, endCol, startRow, endRow) {
    const adjacencies = new Set();

    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const idx = colRowToIndex(c, r, cols);
            const nodeA = cellToNode[idx];
            if (!nodeA) continue;

            if (c + 1 <= endCol) {
                const nodeB = cellToNode[idx + 1];
                if (nodeB && nodeA.id !== nodeB.id) {
                    adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
                }
            }

            if (r + 1 <= endRow) {
                const nodeB = cellToNode[idx + cols];
                if (nodeB && nodeA.id !== nodeB.id) {
                    adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
                }
            }
        }
    }

    return adjacencies;
}

export function repositionNodeCentroid(node, cellToNode, grid, cols, rows, minX, minY, cellSize) {
    let sumCol = 0;
    let sumRow = 0;
    let count = 0;

    for (let i = 0; i < cellToNode.length; i++) {
        if (cellToNode[i]?.id !== node.id) continue;
        const { col, row } = indexToColRow(i, cols);
        sumCol += col;
        sumRow += row;
        count++;
    }

    if (count === 0) return;

    const startCol = node.col;
    const startRow = node.row;
    node.col = Math.floor(sumCol / count);
    node.row = Math.floor(sumRow / count);

    const centroidIdx = colRowToIndex(node.col, node.row, cols);
    if (grid[centroidIdx] === 1 || cellToNode[centroidIdx]?.id !== node.id) {
        node.col = startCol;
        node.row = startRow;
    }

    node.x = minX + node.col * cellSize + cellSize / 2;
    node.y = minY + node.row * cellSize + cellSize / 2;
}

export function findRegionAdjacencies(cellToNode, grid, cols, rows) {
    const adjacencies = new Set();

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = colRowToIndex(c, r, cols);
            const nodeA = cellToNode[idx];
            if (!nodeA) continue;

            if (c + 1 < cols) {
                const nodeB = cellToNode[idx + 1];
                if (nodeB && nodeA.id !== nodeB.id) {
                    adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
                }
            }

            if (r + 1 < rows) {
                const nodeB = cellToNode[idx + cols];
                if (nodeB && nodeA.id !== nodeB.id) {
                    adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
                }
            }
        }
    }

    return adjacencies;
}
