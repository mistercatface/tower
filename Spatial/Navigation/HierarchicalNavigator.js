import { navigationSettings } from "../../Config/Config.js";
import { colRowToIndex, indexToColRow, forEachCardinalNeighbor } from "./GridUtils.js";
import { runLocalAStarFlat, runAbstractAStar } from "./AStar.js";
import {
    RegionNode,
    computeDistanceTransform,
    generateVoronoiRegions,
    findRegionAdjacencies,
    repositionNodeCentroid,
} from "./VoronoiRegions.js";

export class HierarchicalNavigator {
    constructor(cellSize, maxCellsPerChunk, minCellsPerChunk, obstacleGrid) {
        this.cellSize = cellSize;
        this.maxCellsPerChunk = maxCellsPerChunk;
        this.minCellsPerChunk = minCellsPerChunk;
        this.obstacleGrid = obstacleGrid;
        this.distToWall = null;
        this.cellToNode = null;
        this.nodesMap = {};
        this.nodeIdCounter = 0;
        this.aStarGScore = null;
        this.aStarCameFrom = null;
        this.aStarVisited = null;
        this.aStarRunId = 0;
    }

    get grid() {
        return this.obstacleGrid.grid;
    }

    get cols() {
        return this.obstacleGrid.cols;
    }

    get rows() {
        return this.obstacleGrid.rows;
    }

    get minX() {
        return this.obstacleGrid.minX;
    }

    get minY() {
        return this.obstacleGrid.minY;
    }

    ensureBuffers() {
        const size = this.cols * this.rows;
        if (size === 0) return;

        if (!this.aStarGScore || this.aStarGScore.length !== size) {
            this.distToWall = new Float32Array(size);
            this.cellToNode = new Array(size).fill(null);
            this.aStarGScore = new Float32Array(size);
            this.aStarCameFrom = new Int32Array(size);
            this.aStarVisited = new Int32Array(size);
            this.aStarRunId = 0;
        }
    }

    initialize() {
        this.ensureBuffers();
        this.nodesMap = {};
        this.nodeIdCounter = 0;
        this.rebuildRegions();
    }

    rebuildRegions() {
        this.ensureBuffers();
        if (this.cols === 0 || this.rows === 0) return;
        computeDistanceTransform(this.grid, this.cols, this.rows, this.distToWall);
        this.generateChunks();
        this.connectAllNodes();
    }

    worldToGrid(x, y) {
        return this.obstacleGrid.worldToGrid(x, y);
    }

    gridToWorld(col, row) {
        return this.obstacleGrid.gridToWorld(col, row);
    }

    generateChunks() {
        const result = generateVoronoiRegions({
            grid: this.grid,
            distToWall: this.distToWall,
            cols: this.cols,
            rows: this.rows,
            minX: this.minX,
            minY: this.minY,
            cellSize: this.cellSize,
            maxCellsPerChunk: this.maxCellsPerChunk,
            minCellsPerChunk: this.minCellsPerChunk,
            cellToNode: this.cellToNode,
        });

        this.nodesMap = result.nodesMap;
        this.cellToNode = result.cellToNode;
        this.nodeIdCounter = result.nodeIdCounter;
    }

    connectAllNodes() {
        for (const node of Object.values(this.nodesMap)) {
            node.edges = [];
        }

        const adjacencies = findRegionAdjacencies(this.cellToNode, this.grid, this.cols, this.rows);
        this._connectAdjacencies(adjacencies);
    }

    _connectAdjacencies(adjacencies) {
        for (const key of adjacencies) {
            const [idA, idB] = key.split(":");
            this._connectRegionPair(this.nodesMap[idA], this.nodesMap[idB]);
        }
    }

    _connectRegionPair(nodeA, nodeB) {
        if (!nodeA || !nodeB || nodeA.id === nodeB.id) return;
        if (nodeA.edges.some(e => e.targetId === nodeB.id)) return;

        const path = this.runLocalAStar(nodeA.col, nodeA.row, nodeB.col, nodeB.row, 96);
        if (path) {
            nodeA.edges.push({ targetId: nodeB.id, cost: path.length, path });
            nodeB.edges.push({ targetId: nodeA.id, cost: path.length, path: [...path].reverse() });
        }
    }

    _expandDamageBounds(bounds, padding = navigationSettings.hpaDamagePadding) {
        return {
            startCol: Math.max(0, bounds.startCol - padding),
            endCol: Math.min(this.cols - 1, bounds.endCol + padding),
            startRow: Math.max(0, bounds.startRow - padding),
            endRow: Math.min(this.rows - 1, bounds.endRow + padding),
        };
    }

    _collectRegionIdsInBox(startCol, endCol, startRow, endRow) {
        const ids = new Set();
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const node = this.cellToNode[colRowToIndex(col, row, this.cols)];
                if (node) ids.add(node.id);
            }
        }
        return ids;
    }

    _stripEdgePair(nodeA, nodeB) {
        if (!nodeA || !nodeB) return;
        nodeA.edges = nodeA.edges.filter(e => e.targetId !== nodeB.id);
        nodeB.edges = nodeB.edges.filter(e => e.targetId !== nodeA.id);
    }

    _reconnectRegionEdges(node) {
        if (!node) return;

        for (const edge of [...node.edges]) {
            this._stripEdgePair(node, this.nodesMap[edge.targetId]);
        }

        const neighborIds = new Set();
        const nodeCells = node.cells;
        for (let i = 0; i < nodeCells.length; i++) {
            const idx = nodeCells[i];
            const col = idx % this.cols;
            const row = (idx / this.cols) | 0;
            forEachCardinalNeighbor(col, row, this.cols, this.rows, (nc, nr, nIdx) => {
                const other = this.cellToNode[nIdx];
                if (other && other.id !== node.id) {
                    neighborIds.add(other.id);
                }
            });
        }

        for (const otherId of neighborIds) {
            this._connectRegionPair(node, this.nodesMap[otherId]);
        }
    }

    _mergeRegionInto(keep, absorb) {
        if (!keep || !absorb || keep.id === absorb.id) return;

        const absorbCells = absorb.cells;
        for (let i = 0; i < absorbCells.length; i++) {
            const idx = absorbCells[i];
            this.cellToNode[idx] = keep;
            keep.cells.push(idx);
        }
        absorb.cells = [];

        for (const id in this.nodesMap) {
            this.nodesMap[id].edges = this.nodesMap[id].edges.filter(e => e.targetId !== absorb.id);
        }
        delete this.nodesMap[absorb.id];

        repositionNodeCentroid(
            keep, this.cellToNode, this.grid, this.cols, this.rows,
            this.minX, this.minY, this.cellSize
        );
    }

    _createRegionFromCells(cells) {
        const unassigned = new Set(cells);
        while (unassigned.size > 0) {
            const startIdx = unassigned.values().next().value;
            unassigned.delete(startIdx);

            const startCol = startIdx % this.cols;
            const startRow = (startIdx / this.cols) | 0;
            const id = `node_${++this.nodeIdCounter}`;
            const node = new RegionNode(
                id, startCol, startRow, startCol, startRow,
                this.minX, this.minY, this.cellSize
            );
            this.nodesMap[id] = node;

            const queue = [startIdx];
            this.cellToNode[startIdx] = node;
            node.cells.push(startIdx);
            let cellCount = 1;

            let head = 0;
            while (head < queue.length && cellCount < this.maxCellsPerChunk) {
                const currIdx = queue[head++];
                const col = currIdx % this.cols;
                const row = (currIdx / this.cols) | 0;

                forEachCardinalNeighbor(col, row, this.cols, this.rows, (nc, nr, nIdx) => {
                    if (this.grid[nIdx] !== 0 || !unassigned.has(nIdx)) return;
                    unassigned.delete(nIdx);
                    this.cellToNode[nIdx] = node;
                    node.cells.push(nIdx);
                    queue.push(nIdx);
                    cellCount++;
                });
            }

            repositionNodeCentroid(
                node, this.cellToNode, this.grid, this.cols, this.rows,
                this.minX, this.minY, this.cellSize
            );
        }
    }

    _assignOpenedCells(startCol, endCol, startRow, endRow) {
        const visited = new Uint8Array(this.cols * this.rows);

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const idx = colRowToIndex(col, row, this.cols);
                if (this.grid[idx] !== 0 || this.cellToNode[idx] || visited[idx]) continue;

                const component = [];
                const neighborRegions = new Map();
                const queue = [idx];
                visited[idx] = 1;

                let head = 0;
                while (head < queue.length) {
                    const currIdx = queue[head++];
                    component.push(currIdx);
                    const { col: c, row: r } = indexToColRow(currIdx, this.cols);

                    forEachCardinalNeighbor(c, r, this.cols, this.rows, (nc, nr, nIdx) => {
                        if (this.grid[nIdx] !== 0) return;

                        const neighborNode = this.cellToNode[nIdx];
                        if (neighborNode) {
                            neighborRegions.set(neighborNode.id, neighborNode);
                            return;
                        }

                        if (visited[nIdx]) return;
                        if (nc < startCol || nc > endCol || nr < startRow || nr > endRow) return;

                        visited[nIdx] = 1;
                        queue.push(nIdx);
                    });
                }

                if (neighborRegions.size === 0) {
                    this._createRegionFromCells(component);
                } else {
                    const regions = [...neighborRegions.values()];
                    let keep = regions[0];
                    for (let i = 1; i < regions.length; i++) {
                        this._mergeRegionInto(keep, regions[i]);
                    }
                    for (const cellIdx of component) {
                        this.cellToNode[cellIdx] = keep;
                        keep.cells.push(cellIdx);
                    }
                    repositionNodeCentroid(
                        keep, this.cellToNode, this.grid, this.cols, this.rows,
                        this.minX, this.minY, this.cellSize
                    );
                }
            }
        }
    }

    rebuildDamagedArea(bounds) {
        if (!bounds || this.cols === 0 || this.rows === 0) return;

        this.ensureBuffers();
        const box = this._expandDamageBounds(bounds);

        this._assignOpenedCells(box.startCol, box.endCol, box.startRow, box.endRow);

        const affectedIds = this._collectRegionIdsInBox(
            box.startCol, box.endCol, box.startRow, box.endRow
        );
        for (const id of affectedIds) {
            this._reconnectRegionEdges(this.nodesMap[id]);
        }
    }

    findNearestOpenCell(col, row) {
        if (this.grid[colRowToIndex(col, row, this.cols)] === 0) return { col, row };
        for (let r = 1; r <= 5; r++) {
            for (let dr = -r; dr <= r; dr++) {
                for (let dc = -r; dc <= r; dc++) {
                    const nc = col + dc;
                    const nr = row + dr;
                    if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                        if (this.grid[colRowToIndex(nc, nr, this.cols)] === 0) {
                            return { col: nc, row: nr };
                        }
                    }
                }
            }
        }
        return { col, row };
    }

    runLocalAStar(startCol, startRow, targetCol, targetRow, maxPathLen = 80) {
        this.aStarRunId++;
        return runLocalAStarFlat(
            startCol, startRow, targetCol, targetRow,
            this.grid, this.cols, this.rows,
            maxPathLen, this.aStarGScore, this.aStarCameFrom,
            this.aStarVisited, this.aStarRunId
        );
    }

    _connectTempNode(tempNode, gridCol, gridRow, targetNode, isStart) {
        const candidates = new Set();
        const searchRadius = Math.ceil(Math.sqrt(this.maxCellsPerChunk)) * 2;
        
        if (targetNode) {
            candidates.add(targetNode);
            for (const edge of targetNode.edges) {
                const neighbor = this.nodesMap[edge.targetId];
                if (neighbor) candidates.add(neighbor);
            }
        } else {
            for (const id in this.nodesMap) {
                if (id === "start" || id === "target") continue;
                const node = this.nodesMap[id];
                const d = Math.hypot(gridCol - node.col, gridRow - node.row);
                if (d <= searchRadius) {
                    candidates.add(node);
                }
            }
        }
        for (const candidate of candidates) {
            const path = isStart 
                ? this.runLocalAStar(tempNode.col, tempNode.row, candidate.col, candidate.row, 96)
                : this.runLocalAStar(candidate.col, candidate.row, tempNode.col, tempNode.row, 96);
            if (path) {
                if (isStart) {
                    tempNode.edges.push({ targetId: candidate.id, cost: path.length, path: path });
                } else {
                    candidate.edges.push({ targetId: "target", cost: path.length, path: path });
                }
            }
        }
    }

    findPath(startX, startY, targetX, targetY) {
        const startGrid = this.worldToGrid(startX, startY);
        const targetGrid = this.worldToGrid(targetX, targetY);

        let startCol = Math.max(0, Math.min(this.cols - 1, startGrid.col));
        let startRow = Math.max(0, Math.min(this.rows - 1, startGrid.row));
        let targetCol = Math.max(0, Math.min(this.cols - 1, targetGrid.col));
        let targetRow = Math.max(0, Math.min(this.rows - 1, targetGrid.row));

        const startOpen = this.findNearestOpenCell(startCol, startRow);
        startCol = startOpen.col;
        startRow = startOpen.row;

        const targetOpen = this.findNearestOpenCell(targetCol, targetRow);
        targetCol = targetOpen.col;
        targetRow = targetOpen.row;

        const startIdx = colRowToIndex(startCol, startRow, this.cols);
        const targetIdx = colRowToIndex(targetCol, targetRow, this.cols);

        const startNode = this.cellToNode[startIdx];
        const targetNode = this.cellToNode[targetIdx];
        const cellDist = Math.hypot(startCol - targetCol, startRow - targetRow);

        if (cellDist < 32 || (startNode && targetNode && startNode.id === targetNode.id)) {
            const localPath = this.runLocalAStar(startCol, startRow, targetCol, targetRow, 96);
            if (localPath) {
                return localPath.map(cell => this.gridToWorld(cell.col, cell.row));
            }
            return null;
        }

        const startTempNode = new RegionNode("start", startCol, startRow, -999, -999, this.minX, this.minY, this.cellSize);
        const targetTempNode = new RegionNode("target", targetCol, targetRow, -999, -999, this.minX, this.minY, this.cellSize);

        this.nodesMap["start"] = startTempNode;
        this.nodesMap["target"] = targetTempNode;

        try {
            this._connectTempNode(startTempNode, startCol, startRow, startNode, true);
            this._connectTempNode(targetTempNode, targetCol, targetRow, targetNode, false);

            const abstractPath = runAbstractAStar("start", "target", this.nodesMap);

            if (abstractPath) {
                let fullCellPath = [];
                for (let i = 0; i < abstractPath.length - 1; i++) {
                    const nodeA = abstractPath[i];
                    const nodeB = abstractPath[i + 1];
                    const edge = nodeA.edges.find(e => e.targetId === nodeB.id);
                    if (edge && edge.path) {
                        if (fullCellPath.length === 0) {
                            fullCellPath.push(...edge.path);
                        } else {
                            fullCellPath.push(...edge.path.slice(1));
                        }
                    } else {
                        if (fullCellPath.length === 0) {
                            fullCellPath.push({ col: nodeA.col, row: nodeA.row });
                        }
                        fullCellPath.push({ col: nodeB.col, row: nodeB.row });
                    }
                }

                return fullCellPath.map(cell => this.gridToWorld(cell.col, cell.row));
            }

            return null;
        } finally {
            this.cleanupTempEdges();
        }
    }

    cleanupTempEdges() {
        delete this.nodesMap["start"];
        delete this.nodesMap["target"];
        for (const id in this.nodesMap) {
            const node = this.nodesMap[id];
            node.edges = node.edges.filter(e => e.targetId !== "target");
        }
    }
}
