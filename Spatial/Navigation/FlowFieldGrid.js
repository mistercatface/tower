import { OCTILE_OFFSETS } from "../Grid/GridUtils.js";

export class FlowFieldGrid {
    constructor(cellSize, width, height, obstacleGrid) {
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
        this.obstacleGrid = obstacleGrid;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        const size = this.cols * this.rows;

        this.grid = new Uint8Array(size);

        this.flowFieldX = new Float32Array(size);
        this.flowFieldY = new Float32Array(size);
        this.flowFieldDist = new Float32Array(size);

        this.playerFlowFieldX = new Float32Array(size);
        this.playerFlowFieldY = new Float32Array(size);
        this.playerFlowFieldDist = new Float32Array(size);

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

    buildFlowFieldTarget(px, py, targetFieldX, targetFieldY, targetFieldDist, gridData) {
        targetFieldDist.fill(999999);
        const start = this.worldToGrid(px, py);
        if (start.col < 0 || start.col >= this.cols || start.row < 0 || start.row >= this.rows) return;

        const cols = this.cols;
        const rows = this.rows;

        const startIdx = start.row * cols + start.col;
        const queue = [startIdx];
        let head = 0;

        targetFieldX[startIdx] = 0;
        targetFieldY[startIdx] = 0;
        targetFieldDist[startIdx] = 0;

        while (head < queue.length) {
            const currIdx = queue[head++];
            const currCol = currIdx % cols;
            const currRow = (currIdx / cols) | 0;
            const currDist = targetFieldDist[currIdx];

            for (const { dc, dr, cost } of OCTILE_OFFSETS) {
                const nc = currCol + dc;
                const nr = currRow + dr;

                if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                    const nIdx = nr * cols + nc;
                    if (gridData[nIdx] === 1) continue;

                    if (dc !== 0 && dr !== 0) {
                        const check1 = gridData[currRow * cols + nc];
                        const check2 = gridData[nr * cols + currCol];
                        if (check1 === 1 || check2 === 1) {
                            continue;
                        }
                    }

                    const dist = currDist + cost;
                    if (dist < targetFieldDist[nIdx]) {
                        targetFieldX[nIdx] = -dc / cost;
                        targetFieldY[nIdx] = -dr / cost;
                        targetFieldDist[nIdx] = dist;
                        queue.push(nIdx);
                    }
                }
            }
        }
    }

    buildFlowField(px, py) {
        this.buildFlowFieldTarget(px, py, this.flowFieldX, this.flowFieldY, this.flowFieldDist, this.grid);
    }

    buildPlayerFlowField(px, py) {
        this.buildFlowFieldTarget(px, py, this.playerFlowFieldX, this.playerFlowFieldY, this.playerFlowFieldDist, this.grid);
    }

    clearFlowFields() {
        this.flowFieldDist.fill(999999);
        this.playerFlowFieldDist.fill(999999);
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

    gridToWorld(col, row) {
        return {
            x: col * this.cellSize + this.centerX - this.offsetX + this.cellSize / 2,
            y: row * this.cellSize + this.centerY - this.offsetY + this.cellSize / 2,
        };
    }

    getCellBounds(col, row) {
        const minX = col * this.cellSize + this.centerX - this.offsetX;
        const minY = row * this.cellSize + this.centerY - this.offsetY;
        return {
            minX,
            minY,
            maxX: minX + this.cellSize,
            maxY: minY + this.cellSize,
        };
    }

    entityIntersectsCell(x, y, radius, col, row) {
        const { minX, minY, maxX, maxY } = this.getCellBounds(col, row);
        const closestX = Math.max(minX, Math.min(x, maxX));
        const closestY = Math.max(minY, Math.min(y, maxY));
        const dx = x - closestX;
        const dy = y - closestY;
        return dx * dx + dy * dy <= radius * radius;
    }

    sampleDirection(x, y, isPlayerField, outEntity) {
        const targetFieldX = isPlayerField ? this.playerFlowFieldX : this.flowFieldX;
        const targetFieldY = isPlayerField ? this.playerFlowFieldY : this.flowFieldY;
        const targetFieldDist = isPlayerField ? this.playerFlowFieldDist : this.flowFieldDist;

        const halfCell = this.cellSize / 2;
        const gx = (x - (this.centerX - this.offsetX + halfCell)) / this.cellSize;
        const gy = (y - (this.centerY - this.offsetY + halfCell)) / this.cellSize;
        const col0 = Math.floor(gx);
        const row0 = Math.floor(gy);
        const col1 = col0 + 1;
        const row1 = row0 + 1;
        const tx = gx - col0;
        const ty = gy - row0;

        const cols = this.cols;
        const rows = this.rows;

        const c0_valid = col0 >= 0 && col0 < cols;
        const c1_valid = col1 >= 0 && col1 < cols;
        const r0_valid = row0 >= 0 && row0 < rows;
        const r1_valid = row1 >= 0 && row1 < rows;

        let flowX = 0;
        let flowY = 0;
        let totalWeight = 0;

        if (c0_valid && r0_valid) {
            const idx = row0 * cols + col0;
            if (targetFieldDist[idx] < 999999) {
                const w = (1 - tx) * (1 - ty);
                flowX += targetFieldX[idx] * w;
                flowY += targetFieldY[idx] * w;
                totalWeight += w;
            }
        }
        if (c1_valid && r0_valid) {
            const idx = row0 * cols + col1;
            if (targetFieldDist[idx] < 999999) {
                const w = tx * (1 - ty);
                flowX += targetFieldX[idx] * w;
                flowY += targetFieldY[idx] * w;
                totalWeight += w;
            }
        }
        if (c0_valid && r1_valid) {
            const idx = row1 * cols + col0;
            if (targetFieldDist[idx] < 999999) {
                const w = (1 - tx) * ty;
                flowX += targetFieldX[idx] * w;
                flowY += targetFieldY[idx] * w;
                totalWeight += w;
            }
        }
        if (c1_valid && r1_valid) {
            const idx = row1 * cols + col1;
            if (targetFieldDist[idx] < 999999) {
                const w = tx * ty;
                flowX += targetFieldX[idx] * w;
                flowY += targetFieldY[idx] * w;
                totalWeight += w;
            }
        }

        if (totalWeight > 0) {
            const len = Math.sqrt(flowX * flowX + flowY * flowY);
            if (len > 0) {
                outEntity.desiredX = flowX / len;
                outEntity.desiredY = flowY / len;
                return true;
            }
        }
        return false;
    }
}
