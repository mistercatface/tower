import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { isForcefieldEdge, isPortalEdge, PASSAGE_MODE, resolvePassageEdge } from "../Spatial/grid/CellEdge.js";
import { gridWallEdgeEndpoints, canonicalEdgeCellKey, isCanonicalEdgeRepresentative } from "../World/wallGridCells.js";
import { PORTAL_LINK_MODE, resolvePortalLinkRoute } from "./portalLinks.js";
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
function portalEdgeMidpoint(grid, col, row, side) {
    gridWallEdgeEndpoints(grid, col, row, side, EDGE_P1, EDGE_P2, 0);
    return { x: (EDGE_P1.x + EDGE_P2.x) * 0.5, y: (EDGE_P1.y + EDGE_P2.y) * 0.5 };
}
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
/** @param {boolean} powered @param {"unlinked" | "shared" | "source" | "dest"} role */
function portalEdgeStroke(powered, role) {
    if (!powered) return { stroke: "rgba(56, 189, 248, 0.28)", width: 2.5, dash: [6, 5] };
    if (role === "source") return { stroke: "rgba(56, 189, 248, 0.98)", width: 4.5, dash: [] };
    if (role === "dest") return { stroke: "rgba(56, 189, 248, 0.75)", width: 3.5, dash: [4, 4] };
    return { stroke: "rgba(56, 189, 248, 0.95)", width: 4, dash: [] };
}
/** @param {boolean} powered @param {"unlinked" | "shared" | "source" | "dest"} role */
function portalGlyph(powered, role) {
    if (!powered) return { fill: "rgba(56, 189, 248, 0.35)", text: "○" };
    if (role === "unlinked") return { fill: "rgba(56, 189, 248, 0.85)", text: "?" };
    if (role === "source") return { fill: "rgba(251, 146, 60, 0.98)", text: "→" };
    if (role === "dest") return { fill: "rgba(56, 189, 248, 0.85)", text: "○" };
    return { fill: "rgba(167, 139, 250, 0.98)", text: "⇄" };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} lineScale
 * @param {boolean} powered
 * @param {"unlinked" | "shared" | "source" | "dest"} role
 */
function drawPortalMidpointGlyph(ctx, x, y, lineScale, powered, role) {
    const { fill, text } = portalGlyph(powered, role);
    const r = 7 * lineScale;
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 1.5 * lineScale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.font = `bold ${Math.max(8, 10 * lineScale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5 * lineScale);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ col: number, row: number, side: number }} source
 * @param {{ col: number, row: number, side: number }} dest
 * @param {string} linkMode
 * @param {number} lineScale
 */
export function drawPortalConnection(ctx, grid, source, dest, linkMode, lineScale) {
    const start = portalEdgeMidpoint(grid, source.col, source.row, source.side);
    const end = portalEdgeMidpoint(grid, dest.col, dest.row, dest.side);
    const shared = linkMode === PORTAL_LINK_MODE.Shared;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const ax = dx / len;
    const ay = dy / len;
    ctx.strokeStyle = shared ? "rgba(167, 139, 250, 0.92)" : "rgba(251, 146, 60, 0.92)";
    ctx.lineWidth = (shared ? 3 : 3.5) * lineScale;
    ctx.setLineDash(shared ? [10 * lineScale, 6 * lineScale] : []);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (shared) {
        drawDirectionalArrow(ctx, start.x + dx * 0.3, start.y + dy * 0.3, ax, ay, 8 * lineScale, "rgba(255, 255, 255, 0.95)");
        drawDirectionalArrow(ctx, start.x + dx * 0.7, start.y + dy * 0.7, -ax, -ay, 8 * lineScale, "rgba(255, 255, 255, 0.95)");
        return;
    }
    drawDirectionalArrow(ctx, end.x - ax * 12 * lineScale, end.y - ay * 12 * lineScale, ax, ay, 9 * lineScale, "rgba(255, 255, 255, 0.98)");
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
    ctx.save();
    ctx.lineCap = "round";
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row) => {
        for (let side = 0; side < 4; side++) {
            const edge = grid.getCellEdge(col, row, side);
            if (!isForcefieldEdge(edge)) continue;
            if (isPortalEdge(edge)) {
                if (!isCanonicalEdgeRepresentative(grid, col, row, side)) continue;
                const powered = edge.powered === true;
                const route = powered ? resolvePortalLinkRoute(grid, col, row, side) : null;
                let role = /** @type {"unlinked" | "shared" | "source" | "dest"} */ ("unlinked");
                if (route)
                    if (route.linkMode === PORTAL_LINK_MODE.Shared) role = "shared";
                    else if (route.source.col === col && route.source.row === row && route.source.side === side) role = "source";
                    else role = "dest";
                gridWallEdgeEndpoints(grid, col, row, side, EDGE_P1, EDGE_P2, 0);
                const stroke = portalEdgeStroke(powered, role);
                ctx.strokeStyle = stroke.stroke;
                ctx.lineWidth = stroke.width * lineScale;
                ctx.setLineDash(stroke.dash.map((d) => d * lineScale));
                ctx.beginPath();
                ctx.moveTo(EDGE_P1.x, EDGE_P1.y);
                ctx.lineTo(EDGE_P2.x, EDGE_P2.y);
                ctx.stroke();
                ctx.setLineDash([]);
                const mid = portalEdgeMidpoint(grid, col, row, side);
                drawPortalMidpointGlyph(ctx, mid.x, mid.y, lineScale, powered, role);
                if (route) drawPortalConnection(ctx, grid, route.source, route.dest, route.linkMode, lineScale);
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
