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

    sampleDirection(x, y, targetField) {
        const halfCell = this.cellSize / 2;
        const gx = (x - (this.centerX - this.offsetX + halfCell)) / this.cellSize;
        const gy = (y - (this.centerY - this.offsetY + halfCell)) / this.cellSize;
        const col0 = Math.floor(gx);
        const row0 = Math.floor(gy);
        const col1 = col0 + 1;
        const row1 = row0 + 1;
        const tx = gx - col0;
        const ty = gy - row0;
        const getFlowVec = (c, r) => {
            if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return null;
            const f = targetField[r * this.cols + c];
            if (!f) return null;
            const len = Math.hypot(f.x, f.y);
            return len > 0 ? { x: f.x / len, y: f.y / len } : null;
        };
        const v00 = getFlowVec(col0, row0);
        const v10 = getFlowVec(col1, row0);
        const v01 = getFlowVec(col0, row1);
        const v11 = getFlowVec(col1, row1);
        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;
        let flowX = 0;
        let flowY = 0;
        let totalWeight = 0;
        if (v00) { flowX += v00.x * w00; flowY += v00.y * w00; totalWeight += w00; }
        if (v10) { flowX += v10.x * w10; flowY += v10.y * w10; totalWeight += w10; }
        if (v01) { flowX += v01.x * w01; flowY += v01.y * w01; totalWeight += w01; }
        if (v11) { flowX += v11.x * w11; flowY += v11.y * w11; totalWeight += w11; }
        if (totalWeight > 0) {
            const len = Math.hypot(flowX, flowY);
            return len > 0 ? { x: flowX / len, y: flowY / len } : null;
        }
        return null;
    }
}
