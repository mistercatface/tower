import { OCTILE_OFFSETS } from "../Grid/GridUtils.js";
import { worldToGridCentered } from "../Geometry/GridCoords.js";

export const FLOW_FIELD_UNREACHABLE = 999999;
export const FLOW_FIELD_NEIGHBOR_STRIDE = 8;
export const FLOW_FIELD_FULL_RANGE = Infinity;

/**
 * @param {Uint8Array} localGrid
 * @param {object} layout - { cols, rows, cellSize, centerX, centerY, offsetX, offsetY }
 * @param {object} obstacleGrid - world grid with worldToGrid, cols, rows, grid
 */
export function syncLocalObstacles(localGrid, layout, obstacleGrid) {
    const { cols, rows, cellSize, centerX, centerY, offsetX, offsetY } = layout;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const wx = col * cellSize + centerX - offsetX + cellSize / 2;
            const wy = row * cellSize + centerY - offsetY + cellSize / 2;
            const worldCell = obstacleGrid.worldToGrid(wx, wy);
            const idx = row * cols + col;

            if (worldCell.col >= 0 && worldCell.col < obstacleGrid.cols && worldCell.row >= 0 && worldCell.row < obstacleGrid.rows) {
                const worldIdx = worldCell.row * obstacleGrid.cols + worldCell.col;
                localGrid[idx] = obstacleGrid.grid[worldIdx];
            } else {
                localGrid[idx] = 1;
            }
        }
    }
}

export function createNeighborBuffers(cols, rows) {
    const size = cols * rows;
    return {
        neighborGrid: new Int32Array(size * FLOW_FIELD_NEIGHBOR_STRIDE).fill(-1),
        neighborCost: new Float32Array(size * FLOW_FIELD_NEIGHBOR_STRIDE),
    };
}

/** Eight fixed slots per cell (OCTILE_OFFSETS order); unused slots are -1. */
export function buildNeighborGrid(gridData, cols, rows, neighborGrid, neighborCost) {
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const idx = row * cols + col;
            const base = idx << 3;

            for (let i = 0; i < FLOW_FIELD_NEIGHBOR_STRIDE; i++) {
                const { dc, dr, cost } = OCTILE_OFFSETS[i];
                const nc = col + dc;
                const nr = row + dr;
                let nIdx = -1;

                if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                    nIdx = nr * cols + nc;
                    if (gridData[nIdx] === 1) {
                        nIdx = -1;
                    } else if (dc !== 0 && dr !== 0) {
                        const check1 = gridData[row * cols + nc];
                        const check2 = gridData[nr * cols + col];
                        if (check1 === 1 || check2 === 1) {
                            nIdx = -1;
                        }
                    }
                } else {
                    nIdx = -1;
                }

                neighborGrid[base + i] = nIdx;
                neighborCost[base + i] = nIdx === -1 ? 0 : cost;
            }
        }
    }
}

/**
 * @param {object} layout - { cols, rows, cellSize, centerX, centerY, offsetX, offsetY }
 * @param {number} [maxRange=FLOW_FIELD_FULL_RANGE] - stop expanding past this octile cost; partial rebuilds skip the dist fill
 */
export function buildFlowFieldTarget(
    px, py,
    targetFieldX, targetFieldY, targetFieldDist,
    neighborGrid, neighborCost,
    layout,
    maxRange = FLOW_FIELD_FULL_RANGE,
) {
    const fullRebuild = maxRange === FLOW_FIELD_FULL_RANGE;
    if (fullRebuild) {
        targetFieldDist.fill(FLOW_FIELD_UNREACHABLE);
    }

    const { cols, rows, cellSize, centerX, centerY, offsetX, offsetY } = layout;

    const start = worldToGridCentered(px, py, centerX, centerY, offsetX, offsetY, cellSize);
    if (start.col < 0 || start.col >= cols || start.row < 0 || start.row >= rows) return;

    const startIdx = start.row * cols + start.col;
    const queue = [startIdx];
    let head = 0;

    targetFieldX[startIdx] = 0;
    targetFieldY[startIdx] = 0;
    targetFieldDist[startIdx] = 0;

    while (head < queue.length) {
        const currIdx = queue[head++];
        const currDist = targetFieldDist[currIdx];
        if (!fullRebuild && currDist >= maxRange) continue;

        const base = currIdx << 3;

        for (let i = 0; i < FLOW_FIELD_NEIGHBOR_STRIDE; i++) {
            const nIdx = neighborGrid[base + i];
            if (nIdx === -1) continue;

            const dist = currDist + neighborCost[base + i];
            if (!fullRebuild && dist > maxRange) continue;

            if (dist < targetFieldDist[nIdx]) {
                const { dc, dr, cost } = OCTILE_OFFSETS[i];
                targetFieldX[nIdx] = -dc / cost;
                targetFieldY[nIdx] = -dr / cost;
                targetFieldDist[nIdx] = dist;
                queue.push(nIdx);
            }
        }
    }
}

export function getFlowFieldLayout(grid) {
    return { cols: grid.cols, rows: grid.rows, cellSize: grid.cellSize, centerX: grid.centerX, centerY: grid.centerY, offsetX: grid.offsetX, offsetY: grid.offsetY };
}
