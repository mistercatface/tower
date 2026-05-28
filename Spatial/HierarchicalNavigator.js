export class Node {
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

export class HierarchicalNavigator {
    constructor(cellSize = 16, anchorSpacing = 24) {
        this.cellSize = cellSize;
        this.anchorSpacing = anchorSpacing;
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

        this.computeDistanceTransform();
        this.generateAllNodes();
        this.computeVoronoiRegions();
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
        if (seg.isDead) return;
        const halfSize = seg.size / 2;
        const padding = seg.padding;
        const boundingRadius = halfSize * Math.SQRT2 + padding;

        const minGrid = this.worldToGrid(seg.x - boundingRadius, seg.y - boundingRadius);
        const maxGrid = this.worldToGrid(seg.x + boundingRadius, seg.y + boundingRadius);

        const startCol = Math.max(0, minGrid.col);
        const endCol = Math.min(this.cols - 1, maxGrid.col);
        const startRow = Math.max(0, minGrid.row);
        const endRow = Math.min(this.rows - 1, maxGrid.row);

        const cos = Math.cos(-seg.angle);
        const sin = Math.sin(-seg.angle);

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const cx = this.minX + col * this.cellSize + (this.cellSize / 2);
                const cy = this.minY + row * this.cellSize + (this.cellSize / 2);

                const dx = cx - seg.x;
                const dy = cy - seg.y;

                const localX = dx * cos - dy * sin;
                const localY = dx * sin + dy * cos;

                const distX = Math.max(0, Math.abs(localX) - halfSize);
                const distY = Math.max(0, Math.abs(localY) - halfSize);

                if ((distX * distX + distY * distY) <= padding * padding + 0.01) {
                    const idx = row * this.cols + col;
                    this.grid[idx] = 1;
                }
            }
        }
    }

    computeDistanceTransform() {
        const size = this.cols * this.rows;
        this.distToWall.fill(Infinity);

        const queue = [];
        let head = 0;

        for (let i = 0; i < size; i++) {
            if (this.grid[i] === 1) {
                this.distToWall[i] = 0;
                const r = Math.floor(i / this.cols);
                const c = i % this.cols;
                queue.push(c, r);
            }
        }

        const cols = this.cols;
        const rows = this.rows;

        const dc = [0, 1, 0, -1, 1, 1, -1, -1];
        const dr = [-1, 0, 1, 0, -1, 1, 1, -1];
        const ds = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

        while (head < queue.length) {
            const c = queue[head++];
            const r = queue[head++];
            const currIdx = r * cols + c;
            const currDist = this.distToWall[currIdx];

            for (let d = 0; d < 8; d++) {
                const nc = c + dc[d];
                const nr = r + dr[d];
                if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                    const nIdx = nr * cols + nc;
                    const nextDist = currDist + ds[d];
                    if (nextDist < this.distToWall[nIdx]) {
                        this.distToWall[nIdx] = nextDist;
                        queue.push(nc, nr);
                    }
                }
            }
        }

        for (let i = 0; i < size; i++) {
            if (this.distToWall[i] === Infinity) {
                this.distToWall[i] = 1000;
            }
        }
    }

    generateAllNodes() {
        const anchorSpacing = this.anchorSpacing;
        const maxC = Math.ceil(this.cols / anchorSpacing);
        const maxR = Math.ceil(this.rows / anchorSpacing);

        for (let ar = 0; ar < maxR; ar++) {
            for (let ac = 0; ac < maxC; ac++) {
                const anchorCol = ac * anchorSpacing + Math.floor(anchorSpacing / 2);
                const anchorRow = ar * anchorSpacing + Math.floor(anchorSpacing / 2);
                this.generateNodeForAnchor(anchorCol, anchorRow);
            }
        }
    }

    generateNodeForAnchor(anchorCol, anchorRow) {
        const rMax = Math.floor(this.anchorSpacing / 2);
        
        const clampedCol = Math.max(0, Math.min(this.cols - 1, anchorCol));
        const clampedRow = Math.max(0, Math.min(this.rows - 1, anchorRow));

        let bestCol = -1;
        let bestRow = -1;
        let maxD = -1;
        let minDistToAnchor = Infinity;

        const startC = Math.max(0, clampedCol - rMax);
        const endC = Math.min(this.cols - 1, clampedCol + rMax);
        const startR = Math.max(0, clampedRow - rMax);
        const endR = Math.min(this.rows - 1, clampedRow + rMax);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                const idx = r * this.cols + c;
                if (this.grid[idx] === 0) {
                    const d = this.distToWall[idx];
                    const distToAnchor = Math.hypot(c - clampedCol, r - clampedRow);
                    if (d > maxD) {
                        maxD = d;
                        bestCol = c;
                        bestRow = r;
                        minDistToAnchor = distToAnchor;
                    } else if (d === maxD) {
                        if (distToAnchor < minDistToAnchor) {
                            bestCol = c;
                            bestRow = r;
                            minDistToAnchor = distToAnchor;
                        }
                    }
                }
            }
        }

        if (bestCol !== -1) {
            const id = `node_${++this.nodeIdCounter}`;
            const node = new Node(id, bestCol, bestRow, clampedCol, clampedRow, this.minX, this.minY, this.cellSize);
            this.nodesMap[id] = node;
        }
    }

    computeVoronoiRegions() {
        const cols = this.cols;
        const rows = this.rows;
        const size = cols * rows;

        this.cellToNode.fill(null);
        const dist = new Float32Array(size);
        dist.fill(Infinity);

        const queue = [];
        let head = 0;

        for (const id in this.nodesMap) {
            const node = this.nodesMap[id];
            const idx = node.row * cols + node.col;
            dist[idx] = 0;
            this.cellToNode[idx] = node;
            queue.push(node.col, node.row);
        }

        const dc = [0, 1, 0, -1, 1, 1, -1, -1];
        const dr = [-1, 0, 1, 0, -1, 1, 1, -1];
        const ds = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

        while (head < queue.length) {
            const c = queue[head++];
            const r = queue[head++];
            const currIdx = r * cols + c;
            const currNode = this.cellToNode[currIdx];
            const currDist = dist[currIdx];

            for (let d = 0; d < 8; d++) {
                const nc = c + dc[d];
                const nr = r + dr[d];
                if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                    const nIdx = nr * cols + nc;
                    if (this.grid[nIdx] === 0) {
                        const step = ds[d];
                        if (currDist + step < dist[nIdx]) {
                            dist[nIdx] = currDist + step;
                            this.cellToNode[nIdx] = currNode;
                            queue.push(nc, nr);
                        }
                    }
                }
            }
        }
    }

    findAdjacencies() {
        const adjacencies = new Set();
        const cols = this.cols;
        const rows = this.rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const nodeA = this.cellToNode[idx];
                if (!nodeA) continue;

                if (c + 1 < cols) {
                    const nodeB = this.cellToNode[idx + 1];
                    if (nodeB && nodeA.id !== nodeB.id) {
                        const key = nodeA.id < nodeB.id ? `${nodeA.id}:${nodeB.id}` : `${nodeB.id}:${nodeA.id}`;
                        adjacencies.add(key);
                    }
                }

                if (r + 1 < rows) {
                    const nodeB = this.cellToNode[idx + cols];
                    if (nodeB && nodeA.id !== nodeB.id) {
                        const key = nodeA.id < nodeB.id ? `${nodeA.id}:${nodeB.id}` : `${nodeB.id}:${nodeA.id}`;
                        adjacencies.add(key);
                    }
                }
            }
        }
        return adjacencies;
    }

    connectAllNodes() {
        const nodes = Object.values(this.nodesMap);
        for (const n of nodes) {
            n.edges = [];
        }

        const adjacencies = this.findAdjacencies();
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
        const halfSize = seg.size / 2;
        const padding = seg.padding;
        const boundingRadius = halfSize * Math.SQRT2 + padding;

        const minGrid = this.worldToGrid(seg.x - boundingRadius, seg.y - boundingRadius);
        const maxGrid = this.worldToGrid(seg.x + boundingRadius, seg.y + boundingRadius);

        const startCol = Math.max(0, minGrid.col);
        const endCol = Math.min(this.cols - 1, maxGrid.col);
        const startRow = Math.max(0, minGrid.row);
        const endRow = Math.min(this.rows - 1, maxGrid.row);

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                this.grid[r * this.cols + c] = 0;
            }
        }

        const minX = this.minX + startCol * this.cellSize;
        const maxX = this.minX + (endCol + 1) * this.cellSize;
        const minY = this.minY + startRow * this.cellSize;
        const maxY = this.minY + (endRow + 1) * this.cellSize;

        const localWalls = wallSpatialHash ? wallSpatialHash.queryBounds(minX, minY, maxX, maxY) : [];
        for (const wall of localWalls) {
            this.addWallToObstacleGrid(wall);
        }

        this.computeDistanceTransform();
        
        this.nodesMap = {};
        this.nodeIdCounter = 0;
        this.generateAllNodes();
        this.computeVoronoiRegions();
        this.connectAllNodes();
    }

    findNearestOpenCell(col, row) {
        if (this.grid[row * this.cols + col] === 0) return { col, row };
        for (let r = 1; r <= 5; r++) {
            for (let dr = -r; dr <= r; dr++) {
                for (let dc = -r; dc <= r; dc++) {
                    const nc = col + dc;
                    const nr = row + dr;
                    if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                        if (this.grid[nr * this.cols + nc] === 0) {
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
            this.grid, this.cols, this.rows, this.distToWall,
            maxPathLen, this.aStarGScore, this.aStarCameFrom,
            this.aStarVisited, this.aStarRunId
        );
    }

    _connectTempNode(tempNode, gridCol, gridRow, targetNode, isStart) {
        const candidates = new Set();
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
                if (d <= this.anchorSpacing * 2) {
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

        const startIdx = startRow * this.cols + startCol;
        const targetIdx = targetRow * this.cols + targetCol;

        const startNode = this.cellToNode[startIdx];
        const targetNode = this.cellToNode[targetIdx];

        const cellDist = Math.hypot(startCol - targetCol, startRow - targetRow);
        if (cellDist < 32 || (startNode && targetNode && startNode.id === targetNode.id)) {
            const path = this.runLocalAStar(startCol, startRow, targetCol, targetRow, 96);
            if (path) {
                return path.map(cell => this.gridToWorld(cell.col, cell.row));
            }
        }

        const startTempNode = new Node("start", startCol, startRow, -999, -999, this.minX, this.minY, this.cellSize);
        const targetTempNode = new Node("target", targetCol, targetRow, -999, -999, this.minX, this.minY, this.cellSize);

        this.nodesMap["start"] = startTempNode;
        this.nodesMap["target"] = targetTempNode;

        try {
            this._connectTempNode(startTempNode, startCol, startRow, startNode, true);
            this._connectTempNode(targetTempNode, targetCol, targetRow, targetNode, false);

            const abstractPath = runAStar("start", "target", this.nodesMap);

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

function runLocalAStarFlat(startCol, startRow, targetCol, targetRow, grid, cols, rows, distToWall, maxPathLen, gScore, cameFrom, visited, runId) {
    const startIdx = startRow * cols + startCol;
    const targetIdx = targetRow * cols + targetCol;
    if (startIdx === targetIdx) {
        return [{ col: startCol, row: startRow }];
    }

    const openSet = [startIdx];
    
    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;

    const dc = [0, 1, 0, -1, 1, 1, -1, -1];
    const dr = [-1, 0, 1, 0, -1, 1, 1, -1];
    const ds = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

    while (openSet.length > 0) {
        let lowestIdx = 0;
        let lowestF = Infinity;
        for (let i = 0; i < openSet.length; i++) {
            const idx = openSet[i];
            const c = idx % cols;
            const r = Math.floor(idx / cols);
            const f = gScore[idx] + Math.hypot(c - targetCol, r - targetRow);
            if (f < lowestF) {
                lowestF = f;
                lowestIdx = i;
            }
        }

        const currIdx = openSet[lowestIdx];
        openSet.splice(lowestIdx, 1);

        if (currIdx === targetIdx) {
            const path = [];
            let curr = currIdx;
            while (curr !== -1) {
                const c = curr % cols;
                const r = Math.floor(curr / cols);
                path.push({ col: c, row: r });
                curr = cameFrom[curr];
            }
            path.reverse();
            return path;
        }

        const currCol = currIdx % cols;
        const currRow = Math.floor(currIdx / cols);
        const currentG = gScore[currIdx];
        if (currentG > maxPathLen) continue;

        for (let d = 0; d < 8; d++) {
            const nc = currCol + dc[d];
            const nr = currRow + dr[d];
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
                if (grid[nIdx] === 1) continue;

                if (dc[d] !== 0 && dr[d] !== 0) {
                    if (grid[currRow * cols + nc] === 1 || grid[nr * cols + currCol] === 1) {
                        continue;
                    }
                }

                const stepCost = ds[d];
                const tentativeG = currentG + stepCost;

                if (visited[nIdx] !== runId || tentativeG < gScore[nIdx]) {
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    if (!openSet.includes(nIdx)) {
                        openSet.push(nIdx);
                    }
                }
            }
        }
    }
    return null;
}

function runAStar(startNodeId, targetNodeId, nodesMap) {
    const startNode = nodesMap[startNodeId];
    const targetNode = nodesMap[targetNodeId];
    if (!startNode || !targetNode) return null;

    const openSet = new Set([startNodeId]);
    const cameFrom = {};
    
    const gScore = {};
    gScore[startNodeId] = 0;
    
    const fScore = {};
    fScore[startNodeId] = Math.hypot(startNode.col - targetNode.col, startNode.row - targetNode.row);
    
    const getLowestFScoreNode = () => {
        let lowest = null;
        let lowestVal = Infinity;
        for (const id of openSet) {
            if (fScore[id] < lowestVal) {
                lowestVal = fScore[id];
                lowest = id;
            }
        }
        return lowest;
    };

    while (openSet.size > 0) {
        const currentId = getLowestFScoreNode();
        if (currentId === targetNodeId) {
            const path = [];
            let curr = currentId;
            while (curr !== undefined) {
                path.push(nodesMap[curr]);
                curr = cameFrom[curr];
            }
            path.reverse();
            return path;
        }

        openSet.delete(currentId);
        const currentNode = nodesMap[currentId];
        const currentG = gScore[currentId];

        for (const edge of currentNode.edges) {
            const neighborId = edge.targetId;
            const neighborNode = nodesMap[neighborId];
            if (!neighborNode) continue;
            
            const tentativeG = currentG + edge.cost;
            if (gScore[neighborId] === undefined || tentativeG < gScore[neighborId]) {
                cameFrom[neighborId] = currentId;
                gScore[neighborId] = tentativeG;
                fScore[neighborId] = tentativeG + Math.hypot(neighborNode.col - targetNode.col, neighborNode.row - targetNode.row);
                openSet.add(neighborId);
            }
        }
    }
    
    return null;
}