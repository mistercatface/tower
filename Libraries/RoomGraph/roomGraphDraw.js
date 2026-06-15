import { aabbFromTwoPointsInto, createAabb } from "../Math/Aabb2D.js";
import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { listRoomNodes } from "./roomGraphStore.js";
const NODE_OUTLINE_BOUNDS = createAabb();
/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function drawPlacedRoomNodes(ctx, state, grid) {
    const nodes = listRoomNodes(state);
    if (!nodes.length) return;
    const lineScale = getCanvasLineScale(ctx);
    const half = grid.cellSize * 0.5;
    ctx.save();
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const c0 = grid.gridToWorld(node.col, node.row);
        const c1 = grid.gridToWorld(node.col + node.width - 1, node.row + node.height - 1);
        drawAabbHighlight(ctx, aabbFromTwoPointsInto(NODE_OUTLINE_BOUNDS, c0.x - half, c0.y - half, c1.x + half, c1.y + half), {
            fill: "rgba(120, 180, 255, 0.08)",
            stroke: "rgba(120, 180, 255, 0.55)",
            lineWidth: lineScale,
            dash: [6, 4],
        });
    }
    ctx.restore();
}
