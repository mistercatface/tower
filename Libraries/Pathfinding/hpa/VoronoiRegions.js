import {
    CARDINAL_OFFSETS,
    OCTILE_OFFSETS,
    colRowToIndex,
    indexToColRow,
    makeAdjacencyKey,
    forEachCardinalNeighbor,
} from "../../Spatial/grid/GridUtils.js";

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

export function computeDistanceTransform(grid, cols, rows, distToWall = null) {
    const size = cols * rows;
    const distances = distToWall ?? new Float32Array(size);
    distances.fill(Infinity);

    const queue = [];
    let head = 0;

    for (let i = 0; i < size; i++) {
        if (grid[i] === 1) {
            distances[i] = 0;
            const col = i % cols;
            const row = (i / cols) | 0;
            queue.push(col, row);
        }
    }

    while (head < queue.length) {
        const c = queue[head++];
        const r = queue[head++];
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
        const c = currIdx % cols;
        const r = (currIdx / cols) | 0;

        for (const { dc, dr } of CARDINAL_OFFSETS) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
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

function mergeSmallRegions(nodesMap, cellToNode, cols, rows, minCellsPerChunk) {
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
                const col = cellIdx % cols;
                const row = (cellIdx / cols) | 0;
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

function repositionRegionCentroids(nodesMap, grid, cols, rows, minX, minY, cellSize, cellToNode) {
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

        const startCol = startIdx % cols;
        const startRow = (startIdx / cols) | 0;
        const id = `node_${++nodeIdCounter}`;
        const node = new RegionNode(id, startCol, startRow, startCol, startRow, minX, minY, cellSize);
        nodesMap[id] = node;

        floodFillRegion(startIdx, node, grid, cols, rows, assignment, node.cells, maxCellsPerChunk);
    }

    if (minCellsPerChunk > 0) {
        mergeSmallRegions(nodesMap, assignment, cols, rows, minCellsPerChunk);
    }

    repositionRegionCentroids(nodesMap, grid, cols, rows, minX, minY, cellSize, assignment);

    return { nodesMap, cellToNode: assignment, nodeIdCounter };
}

export function findRegionAdjacenciesInBox(cellToNode, cols, rows, startCol, endCol, startRow, endRow) {
    const adjacencies = new Set();

    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const idx = r * cols + c;
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

    const startCol = node.col;
    const startRow = node.row;
    node.col = Math.floor(sumCol / count);
    node.row = Math.floor(sumRow / count);

    const centroidIdx = node.row * cols + node.col;
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
            const idx = r * cols + c;
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
