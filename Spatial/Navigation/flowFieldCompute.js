import { OCTILE_OFFSETS } from "../Grid/GridUtils.js";
import { worldToGridCentered } from "../Geometry/GridCoords.js";

export const FLOW_FIELD_UNREACHABLE = 999999;

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

/**
 * @param {object} layout - { cols, rows, cellSize, centerX, centerY, offsetX, offsetY }
 */
export function buildFlowFieldTarget(px, py, targetFieldX, targetFieldY, targetFieldDist, gridData, layout) {
    targetFieldDist.fill(FLOW_FIELD_UNREACHABLE);
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

export function getFlowFieldLayout(grid) {
    return { cols: grid.cols, rows: grid.rows, cellSize: grid.cellSize, centerX: grid.centerX, centerY: grid.centerY, offsetX: grid.offsetX, offsetY: grid.offsetY };
}
