import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { isForcefieldEdge } from "../Spatial/grid/CellEdge.js";
import { gridWallEdgeEndpoints } from "../World/wallGridCells.js";
import { isForcefieldPowered } from "./forcefieldPower.js";
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 */
export function drawForcefieldEdges(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const bounds = viewport.boundsVisibleDefault;
    const minCol = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).col);
    const maxCol = Math.min(grid.cols - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).col);
    const minRow = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).row);
    const maxRow = Math.min(grid.rows - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).row);
    const lineScale = getCanvasLineScale(ctx);
    ctx.save();
    ctx.lineCap = "round";
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row) => {
        for (let side = 0; side < 4; side++) {
            const edge = grid.getCellEdge(col, row, side);
            if (!isForcefieldEdge(edge)) continue;
            const powered = isForcefieldPowered(state, grid, col, row, side);
            gridWallEdgeEndpoints(grid, col, row, side, EDGE_P1, EDGE_P2, 0);
            ctx.strokeStyle = powered ? "rgba(56, 189, 248, 0.95)" : "rgba(56, 189, 248, 0.28)";
            ctx.lineWidth = (powered ? 4 : 2.5) * lineScale;
            ctx.beginPath();
            ctx.moveTo(EDGE_P1.x, EDGE_P1.y);
            ctx.lineTo(EDGE_P2.x, EDGE_P2.y);
            ctx.stroke();
        }
    });
    ctx.restore();
}
