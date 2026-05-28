import { colRowToIndex } from "./GridUtils.js";
import { runLocalAStarFlat, runAbstractAStar } from "./AStar.js";
import {
    RegionNode,
    computeDistanceTransform,
    generateVoronoiRegions,
    findRegionAdjacencies,
} from "./VoronoiRegions.js";
import {
    getWallCellBounds,
    cellBoundsToWorldBounds,
    markWallOnGrid,
    clearWallCells,
} from "./ObstacleGrid.js";

export { RegionNode as Node };

export class HierarchicalNavigator {
    constructor(cellSize, maxCellsPerChunk, minCellsPerChunk) {
        this.cellSize = cellSize;
        this.maxCellsPerChunk = maxCellsPerChunk;
        this.minCellsPerChunk = minCellsPerChunk;
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;
        this.cols = 0;
        this.rows = 0;
        this.grid = null;
        this.distToWall = null;
        this.cellToNode = null;
        this.nodesMap = {};
        this.nodeIdCounter = 0;
        this.aStarGScore = null;
        this.aStarCameFrom = null;
        this.aStarVisited = null;
        this.aStarRunId = 0;
    }

    initialize(walls, wallSpatialHash) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const w of walls) {
            const r = w.size / 2 + w.padding;
            minX = Math.min(minX, w.x - r);
            maxX = Math.max(maxX, w.x + r);
            minY = Math.min(minY, w.y - r);
            maxY = Math.max(maxY, w.y + r);
        }

        if (minX === Infinity) {
            minX = -2000;
            maxX = 2000;
            minY = -12000;
            maxY = 2000;
        } else {
            minX -= 1500;
            maxX += 1500;
            minY -= 1500;
            maxY += 1500;
        }

        minX = Math.floor(minX / this.cellSize) * this.cellSize;
        minY = Math.floor(minY / this.cellSize) * this.cellSize;
        maxX = Math.ceil(maxX / this.cellSize) * this.cellSize;
        maxY = Math.ceil(maxY / this.cellSize) * this.cellSize;

        this.minX = minX;
        this.maxX = maxX;
        this.minY = minY;
        this.maxY = maxY;

        this.cols = Math.ceil((maxX - minX) / this.cellSize);
        this.rows = Math.ceil((maxY - minY) / this.cellSize);

        const size = this.cols * this.rows;
        this.grid = new Uint8Array(size);
        this.distToWall = new Float32Array(size);
        this.cellToNode = new Array(size).fill(null);
        this.nodesMap = {};
        this.nodeIdCounter = 0;

        this.aStarGScore = new Float32Array(size);
        this.aStarCameFrom = new Int32Array(size);
        this.aStarVisited = new Int32Array(size);
        this.aStarRunId = 0;

        for (const seg of walls) {
            this.addWallToObstacleGrid(seg);
        }

        this.rebuildRegions();
    }

    rebuildRegions() {
        computeDistanceTransform(this.grid, this.cols, this.rows, this.distToWall);
        this.generateChunks();
        this.connectAllNodes();
    }

    worldToGrid(x, y) {
        const col = Math.floor((x - this.minX) / this.cellSize);
        const row = Math.floor((y - this.minY) / this.cellSize);
        return { col, row };
    }

    gridToWorld(col, row) {
        const x = this.minX + col * this.cellSize + this.cellSize / 2;
        const y = this.minY + row * this.cellSize + this.cellSize / 2;
        return { x, y };
    }

    addWallToObstacleGrid(seg) {
        markWallOnGrid(seg, this.grid, this.cols, this.rows, {
            worldToGrid: (x, y) => this.worldToGrid(x, y),
            cellCenter: (col, row) => ({
                x: this.minX + col * this.cellSize + this.cellSize / 2,
                y: this.minY + row * this.cellSize + this.cellSize / 2,
            }),
        });
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

    handleWallDestroyed(seg, wallSpatialHash) {
        const bounds = getWallCellBounds(seg, (x, y) => this.worldToGrid(x, y), this.cols, this.rows);
        clearWallCells(this.grid, this.cols, bounds);

        const worldBounds = cellBoundsToWorldBounds(bounds, this.minX, this.minY, this.cellSize);
        const localWalls = wallSpatialHash
            ? wallSpatialHash.queryBounds(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY)
            : [];
        for (const wall of localWalls) {
            this.addWallToObstacleGrid(wall);
        }

        this.rebuildRegions();
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

    navigateEntity(entity, targetX, targetY, updateInterval) {
        const now = Date.now();
        if (!entity.hpaPath || now - entity.hpaLastUpdate > updateInterval) {
            entity.hpaPath = this.findPath(entity.x, entity.y, targetX, targetY);
            entity.hpaLastUpdate = now;
        }
        if (entity.hpaPath && entity.hpaPath.length > 0) {
            let waypointIdx = 0;
            while (waypointIdx < entity.hpaPath.length) {
                const wp = entity.hpaPath[waypointIdx];
                const distToWp = Math.hypot(entity.x - wp.x, entity.y - wp.y);
                if (distToWp > 24) {
                    break;
                }
                waypointIdx++;
            }
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
