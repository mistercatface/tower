import { colRowToIndex } from "./GridUtils.js";
import { runLocalAStarFlat, runAbstractAStar } from "./AStar.js";
import {
    RegionNode,
    computeDistanceTransform,
    generateVoronoiRegions,
    findRegionAdjacencies,
} from "./VoronoiRegions.js";

export { RegionNode as Node };

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
        const nodes = Object.values(this.nodesMap);
        for (const n of nodes) {
            n.edges = [];
        }

        const adjacencies = findRegionAdjacencies(this.cellToNode, this.grid, this.cols, this.rows);
        for (const key of adjacencies) {
            const [idA, idB] = key.split(":");
            const nodeA = this.nodesMap[idA];
            const nodeB = this.nodesMap[idB];
            if (nodeA && nodeB) {
                const path = this.runLocalAStar(nodeA.col, nodeA.row, nodeB.col, nodeB.row, 96);
                if (path) {
                    nodeA.edges.push({ targetId: nodeB.id, cost: path.length, path: path });
                    nodeB.edges.push({ targetId: nodeA.id, cost: path.length, path: [...path].reverse() });
                }
            }
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

    _advancePathWaypoint(entity, path) {
        if (!path || path.length === 0) return 0;

        const reach = Math.max(24, (entity.speed || 50) * 0.15);
        let idx = 0;

        while (idx < path.length - 1) {
            const wp = path[idx];
            const next = path[idx + 1];
            const dist = Math.hypot(entity.x - wp.x, entity.y - wp.y);

            const segDx = next.x - wp.x;
            const segDy = next.y - wp.y;
            const segLenSq = segDx * segDx + segDy * segDy;

            let passed = dist <= reach;
            if (!passed && segLenSq > 0) {
                const t = ((entity.x - wp.x) * segDx + (entity.y - wp.y) * segDy) / segLenSq;
                passed = t > 1;
            }

            if (passed) {
                idx++;
            } else {
                break;
            }
        }

        if (idx < path.length && Math.hypot(entity.x - path[idx].x, entity.y - path[idx].y) <= reach) {
            idx++;
        }

        return idx;
    }

    navigateEntity(entity, targetX, targetY, updateInterval) {
        const now = Date.now();
        if (!entity.hpaPath || now - entity.hpaLastUpdate > updateInterval) {
            entity.hpaPath = this.findPath(entity.x, entity.y, targetX, targetY);
            entity.hpaLastUpdate = now;
        }
        if (entity.hpaPath && entity.hpaPath.length > 0) {
            const waypointIdx = this._advancePathWaypoint(entity, entity.hpaPath);
            if (waypointIdx < entity.hpaPath.length) {
                const wp = entity.hpaPath[waypointIdx];
                const dx = wp.x - entity.x;
                const dy = wp.y - entity.y;
                const len = Math.hypot(dx, dy);
                if (len > 0) {
                    entity.desiredX = dx / len;
                    entity.desiredY = dy / len;
                } else {
                    entity.desiredX = 0;
                    entity.desiredY = 0;
                }
                return true;
            }
        }
        return false;
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
            const path = this.runLocalAStar(startCol, startRow, targetCol, targetRow, 96);
            if (path) {
                return path.map(cell => this.gridToWorld(cell.col, cell.row));
            }
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
