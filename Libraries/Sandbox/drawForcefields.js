import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { drawPortalEdgeStrip } from "../Render/portalDraw.js";
import { isForcefieldEdge, isPortalEdge, PASSAGE_MODE, resolvePassageEdge } from "../Spatial/grid/CellEdge.js";
import { gridWallEdgeEndpoints, canonicalEdgeCellKey, isCanonicalEdgeRepresentative } from "../World/wallGridCells.js";
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} ax
 * @param {number} ay
 * @param {number} size
 * @param {string} fillStyle
 */
function drawDirectionalArrow(ctx, x, y, ax, ay, size, fillStyle) {
    const perpX = -ay;
    const perpY = ax;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x + ax * size, y + ay * size);
    ctx.lineTo(x - ax * size * 0.35 + perpX * size * 0.55, y - ay * size * 0.35 + perpY * size * 0.55);
    ctx.lineTo(x - ax * size * 0.35 - perpX * size * 0.55, y - ay * size * 0.35 - perpY * size * 0.55);
    ctx.closePath();
    ctx.fill();
}
/** @param {number} allowedSide */
function passageOutwardVector(allowedSide) {
    if (allowedSide === 0) return { x: 0, y: -1 };
    if (allowedSide === 1) return { x: 1, y: 0 };
    if (allowedSide === 2) return { x: 0, y: 1 };
    return { x: -1, y: 0 };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} midX
 * @param {number} midY
 * @param {number} ax
 * @param {number} ay
 * @param {number} size
 * @param {string} fillStyle
 */
function drawPassageArrow(ctx, midX, midY, ax, ay, size, fillStyle) {
    drawDirectionalArrow(ctx, midX, midY, ax, ay, size, fillStyle);
}
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
    const tripwireTriggered = state.sandbox.tripwireTriggeredKeys;
    const px = viewport.x;
    const py = viewport.y;
    ctx.save();
    ctx.lineCap = "round";
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row) => {
        for (let side = 0; side < 4; side++) {
            const edge = grid.getCellEdge(col, row, side);
            if (!isForcefieldEdge(edge)) continue;
            if (isPortalEdge(edge)) {
                if (!isCanonicalEdgeRepresentative(grid, col, row, side)) continue;
                drawPortalEdgeStrip(ctx, grid, col, row, side, edge, px, py);
                continue;
            }
            const { mode, allowedSide, powered } = resolvePassageEdge(edge, side);
            gridWallEdgeEndpoints(grid, col, row, side, EDGE_P1, EDGE_P2, 0);
            const midX = (EDGE_P1.x + EDGE_P2.x) * 0.5;
            const midY = (EDGE_P1.y + EDGE_P2.y) * 0.5;
            if (mode === PASSAGE_MODE.Tripwire) {
                const tripped = powered && tripwireTriggered.has(canonicalEdgeCellKey(grid, col, row, side));
                if (!powered) {
                    ctx.strokeStyle = "rgba(161, 161, 170, 0.55)";
                    ctx.lineWidth = 2 * lineScale;
                    ctx.setLineDash([3 * lineScale, 6 * lineScale]);
                } else if (tripped) {
                    ctx.strokeStyle = "rgba(239, 68, 68, 0.98)";
                    ctx.lineWidth = 4 * lineScale;
                    ctx.setLineDash([]);
                } else {
                    ctx.strokeStyle = "rgba(251, 146, 60, 0.98)";
                    ctx.lineWidth = 3.5 * lineScale;
                    ctx.setLineDash([8 * lineScale, 5 * lineScale]);
                }
            } else if (mode === PASSAGE_MODE.OneWay) {
                ctx.setLineDash([]);
                ctx.strokeStyle = powered ? "rgba(192, 132, 252, 0.98)" : "rgba(192, 132, 252, 0.32)";
                ctx.lineWidth = (powered ? 4 : 2.5) * lineScale;
            } else {
                ctx.setLineDash([]);
                ctx.strokeStyle = powered ? "rgba(56, 189, 248, 0.95)" : "rgba(56, 189, 248, 0.28)";
                ctx.lineWidth = (powered ? 4 : 2.5) * lineScale;
            }
            ctx.beginPath();
            ctx.moveTo(EDGE_P1.x, EDGE_P1.y);
            ctx.lineTo(EDGE_P2.x, EDGE_P2.y);
            ctx.stroke();
            ctx.setLineDash([]);
            if (mode === PASSAGE_MODE.OneWay) {
                const { x: ax, y: ay } = passageOutwardVector(allowedSide);
                drawPassageArrow(ctx, midX, midY, ax, ay, 6 * lineScale, powered ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.45)");
            }
        }
    });
    ctx.restore();
}
