import { fillCircle, strokeSegment } from "../Canvas/CanvasPath.js";
import { createAabb, emptyAabbInto, growAabbFromCenterInto } from "../Math/Aabb2D.js";
import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { listRoomLinks, listRoomNodes, roomNodeCenterWorld } from "./roomGraphStore.js";
const NODE_OUTLINE_BOUNDS = createAabb();
/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {{ selectedNodeId?: number | null, selectedLinkId?: number | null, wireFromNodeId?: number | null, wireCursor?: { x: number, y: number } | null, showRoomNodesAlways?: boolean, wireModeActive?: boolean }} [options] */
export function drawPlacedRoomNodes(ctx, state, grid, { selectedNodeId = null, selectedLinkId = null, wireFromNodeId = null, wireCursor = null, showRoomNodesAlways = false, wireModeActive = false } = {}) {
    if (!showRoomNodesAlways && !wireModeActive) return;
    const nodes = listRoomNodes(state);
    const links = listRoomLinks(state);
    const lineScale = getCanvasLineScale(ctx);
    const half = grid.cellHalfSize;
    ctx.save();
    if (showRoomNodesAlways) {
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const nodeA = nodes.find((node) => node.id === link.a);
            const nodeB = nodes.find((node) => node.id === link.b);
            if (!nodeA || !nodeB) continue;
            const a = roomNodeCenterWorld(grid, nodeA);
            const b = roomNodeCenterWorld(grid, nodeB);
            drawWire(ctx, a.x, a.y, b.x, b.y, link.id === selectedLinkId ? "#64B5F6" : "#5C9FD6");
        }
    }
    if (wireFromNodeId != null && wireCursor) {
        const fromNode = nodes.find((node) => node.id === wireFromNodeId);
        if (fromNode) {
            const from = roomNodeCenterWorld(grid, fromNode);
            drawWire(ctx, from.x, from.y, wireCursor.x, wireCursor.y, "#FFB74D");
        }
    }
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const selected = node.id === selectedNodeId;
        const c0 = grid.gridToWorld(node.col, node.row);
        const c1 = grid.gridToWorld(node.col + node.width - 1, node.row + node.height - 1);
        const bounds = emptyAabbInto(NODE_OUTLINE_BOUNDS);
        growAabbFromCenterInto(bounds, c0.x, c0.y, half, half);
        growAabbFromCenterInto(bounds, c1.x, c1.y, half, half);
        drawAabbHighlight(ctx, bounds, {
            fill: selected ? "rgba(120, 180, 255, 0.16)" : wireModeActive ? "rgba(120, 180, 255, 0.12)" : "rgba(120, 180, 255, 0.08)",
            stroke: selected ? "rgba(120, 180, 255, 0.95)" : wireModeActive ? "rgba(120, 180, 255, 0.75)" : "rgba(120, 180, 255, 0.55)",
            lineWidth: lineScale,
            dash: [6, 4],
        });
    }
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {string} color */
function drawWire(ctx, x0, y0, x1, y1, color) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = color;
    strokeSegment(ctx, x0, y0, x1, y1);
    ctx.fillStyle = color;
    fillCircle(ctx, x1, y1, 3);
    ctx.restore();
}
