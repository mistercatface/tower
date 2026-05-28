export class FlowFieldGrid {
    constructor(cellSize, width, height, obstacleGrid) {
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
        this.obstacleGrid = obstacleGrid;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Array(this.cols * this.rows).fill(0);
        this.flowField = new Array(this.cols * this.rows).fill(null);
        this.playerFlowField = new Array(this.cols * this.rows).fill(null);
        this.offsetX = (width / 2) + (cellSize / 2);
        this.offsetY = (height / 2) + (cellSize / 2);
        this.centerX = 0;
        this.centerY = 0;
    }

    rebuild(segments, targetX, targetY) {
        if (segments) {
            this.obstacleGrid.rebuild(segments);
        }
        this.refresh(targetX, targetY);
    }

    refresh(targetX, targetY, playerTargetX = null, playerTargetY = null) {
        this.clearFlowFields();
        this.syncLocalObstacles();
        this.buildFlowField(targetX, targetY);
        if (playerTargetX !== null && playerTargetY !== null) {
            this.buildPlayerFlowField(playerTargetX, playerTargetY);
        }
    }

    shiftCenter(newCenterX, newCenterY, targetX, targetY, playerTargetX = null, playerTargetY = null) {
        this.centerX = newCenterX;
        this.centerY = newCenterY;
        this.refresh(targetX, targetY, playerTargetX, playerTargetY);
    }

    syncLocalObstacles() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const wx = col * this.cellSize + this.centerX - this.offsetX + this.cellSize / 2;
                const wy = row * this.cellSize + this.centerY - this.offsetY + this.cellSize / 2;
                const worldCell = this.obstacleGrid.worldToGrid(wx, wy);
                const idx = row * this.cols + col;

                if (
                    worldCell.col >= 0 && worldCell.col < this.obstacleGrid.cols &&
                    worldCell.row >= 0 && worldCell.row < this.obstacleGrid.rows
                ) {
                    const worldIdx = worldCell.row * this.obstacleGrid.cols + worldCell.col;
                    this.grid[idx] = this.obstacleGrid.grid[worldIdx];
                } else {
                    this.grid[idx] = 1;
                }
            }
        }
    }

    buildFlowFieldTarget(px, py, targetField, gridData) {
        targetField.fill(null);
        const start = this.worldToGrid(px, py);
        if (start.col < 0 || start.col >= this.cols || start.row < 0 || start.row >= this.rows) return;

        const queue = [start];
        targetField[start.row * this.cols + start.col] = { x: 0, y: 0, dist: 0 };
        
        const dirs = [
            {c: 0, r: -1}, {c: 1, r: -1}, {c: 1, r: 0}, {c: 1, r: 1},
            {c: 0, r: 1}, {c: -1, r: 1}, {c: -1, r: 0}, {c: -1, r: -1}
        ];

        let head = 0;
        while(head < queue.length) {
            const curr = queue[head++];
            const currIdx = curr.row * this.cols + curr.col;
            const currData = targetField[currIdx];

            for (const d of dirs) {
                const nc = curr.col + d.c;
                const nr = curr.row + d.r;
                if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                    const nIdx = nr * this.cols + nc;
                    if (gridData[nIdx] === 1) continue;
                    
                    if (d.c !== 0 && d.r !== 0) {
                        const check1 = gridData[curr.row * this.cols + nc];
                        const check2 = gridData[nr * this.cols + curr.col];
                        if (check1 === 1 || check2 === 1) {
                            continue;
                        }
                    }

                    const dist = currData.dist + Math.hypot(d.c, d.r);
                    if (!targetField[nIdx] || dist < targetField[nIdx].dist) {
                        targetField[nIdx] = {
                            x: -d.c,
                            y: -d.r,
                            dist: dist
                        };
                        queue.push({col: nc, row: nr});
                    }
                }
            }
        }
    }

    buildFlowField(px, py) {
        this.buildFlowFieldTarget(px, py, this.flowField, this.grid);
    }

    buildPlayerFlowField(px, py) {
        this.buildFlowFieldTarget(px, py, this.playerFlowField, this.grid);
    }

    getNodeCenterFromField(x, y, field) {
        let { col, row } = this.worldToGrid(x, y);

        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            let flow = field[row * this.cols + col];

            if (!flow) {
                let bestDist = Infinity;
                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        const nr = row + r;
                        const nc = col + c;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            const neighborFlow = field[nr * this.cols + nc];
                            if (neighborFlow) {
                                const dist = Math.hypot(c, r);
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    flow = neighborFlow;
                                    col = nc;
                                    row = nr;
                                }
                            }
                        }
                    }
                }
            }

            if (flow && (flow.x !== 0 || flow.y !== 0)) {
                const nextCol = col + flow.x;
                const nextRow = row + flow.y;
                return {
                    x: nextCol * this.cellSize + this.centerX - this.offsetX + (this.cellSize / 2),
                    y: nextRow * this.cellSize + this.centerY - this.offsetY + (this.cellSize / 2)
                };
            }
        }
        return null;
    }

    getPlayerNextNodeCenter(x, y) {
        return this.getNodeCenterFromField(x, y, this.playerFlowField);
    }

    getNextNodeCenter(x, y) {
        return this.getNodeCenterFromField(x, y, this.flowField);
    }

    clearFlowFields() {
        this.flowField.fill(null);
        this.playerFlowField.fill(null);
    }

    clear() {
        this.grid.fill(0);
        this.clearFlowFields();
    }

    worldToGrid(x, y) {
        const col = Math.floor((x - this.centerX + this.offsetX) / this.cellSize);
        const row = Math.floor((y - this.centerY + this.offsetY) / this.cellSize);
        return { col, row };
    }

    getNearbySegments(entity) {
        return this.obstacleGrid.getNearbySegments(entity);
    }
}
