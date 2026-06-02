import { worldToGridCentered, gridToWorldCentered, getCellBoundsCentered } from "../Geometry/GridCoords.js";
import { FLOW_FIELD_UNREACHABLE, syncLocalObstacles, buildFlowFieldTarget, getFlowFieldLayout } from "./flowFieldCompute.js";

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

        this.offsetX = width / 2 + cellSize / 2;
        this.offsetY = height / 2 + cellSize / 2;
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
        syncLocalObstacles(this.grid, getFlowFieldLayout(this), this.obstacleGrid);
    }

    buildFlowField(px, py) {
        buildFlowFieldTarget(px, py, this.flowFieldX, this.flowFieldY, this.flowFieldDist, this.grid, getFlowFieldLayout(this));
    }

    buildPlayerFlowField(px, py) {
        buildFlowFieldTarget(px, py, this.playerFlowFieldX, this.playerFlowFieldY, this.playerFlowFieldDist, this.grid, getFlowFieldLayout(this));
    }

    clearFlowFields() {
        this.flowFieldDist.fill(FLOW_FIELD_UNREACHABLE);
        this.playerFlowFieldDist.fill(FLOW_FIELD_UNREACHABLE);
    }

    clear() {
        this.grid.fill(0);
        this.clearFlowFields();
    }

    worldToGrid(x, y) {
        return worldToGridCentered(x, y, this.centerX, this.centerY, this.offsetX, this.offsetY, this.cellSize);
    }

    gridToWorld(col, row) {
        return gridToWorldCentered(col, row, this.centerX, this.centerY, this.offsetX, this.offsetY, this.cellSize);
    }

    getCellBounds(col, row) {
        return getCellBoundsCentered(col, row, this.centerX, this.centerY, this.offsetX, this.offsetY, this.cellSize);
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
            if (targetFieldDist[idx] < FLOW_FIELD_UNREACHABLE) {
                const w = (1 - tx) * (1 - ty);
                flowX += targetFieldX[idx] * w;
                flowY += targetFieldY[idx] * w;
                totalWeight += w;
            }
        }
        if (c1_valid && r0_valid) {
            const idx = row0 * cols + col1;
            if (targetFieldDist[idx] < FLOW_FIELD_UNREACHABLE) {
                const w = tx * (1 - ty);
                flowX += targetFieldX[idx] * w;
                flowY += targetFieldY[idx] * w;
                totalWeight += w;
            }
        }
        if (c0_valid && r1_valid) {
            const idx = row1 * cols + col0;
            if (targetFieldDist[idx] < FLOW_FIELD_UNREACHABLE) {
                const w = (1 - tx) * ty;
                flowX += targetFieldX[idx] * w;
                flowY += targetFieldY[idx] * w;
                totalWeight += w;
            }
        }
        if (c1_valid && r1_valid) {
            const idx = row1 * cols + col1;
            if (targetFieldDist[idx] < FLOW_FIELD_UNREACHABLE) {
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
