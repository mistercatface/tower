import { strokeSegment } from "../Canvas/CanvasPath.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { getCellEdgeBarrierDebugOverlay } from "../Spatial/grid/gridCellEdges.js";
/**
 * Blocked cell edges only — lines sit exactly on the grid cell boundary (same line physics uses as inner wall face).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {object} prop
 */
export function drawCellEdgeBarrierDebugOverlay(ctx, state, prop) {
    const { edges } = getCellEdgeBarrierDebugOverlay(prop, state.obstacleGrid);
    const lineScale = getCanvasLineScale(ctx);
    ctx.save();
    ctx.lineWidth = 3 * lineScale;
    ctx.strokeStyle = "rgba(255, 235, 59, 1)";
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        if (!edge.blocked) continue;
        strokeSegment(ctx, edge.x0, edge.y0, edge.x1, edge.y1);
    }
    ctx.restore();
}
