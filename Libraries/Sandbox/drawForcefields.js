import { drawPortalEdgeStrip } from "../Render/portalDraw.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { isForcefieldEdge, isPortalEdge, PASSAGE_MODE, resolvePassageEdge } from "../Spatial/grid/CellEdge.js";
import { gridSideOutwardVector } from "../Spatial/grid/GridUtils.js";
import { forEachGridEdge, gridWallEdgeEndpoints, canonicalEdgeCellKey } from "../World/wallGridCells.js";
import { projectPropVertex } from "../Render/Props3D/propMesh.js";
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
const dummyProp = { x: 0, y: 0 };
const FORCEFIELD_HEIGHT = 10;
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
function drawCool3DForcefield(ctx, px, py, p1, p2, mode, powered, tripped, lineScale, allowedSide, midX, midY) {
    const p1Base = projectPropVertex(dummyProp, px, py, p1.x, p1.y, 0);
    const p1Top = projectPropVertex(dummyProp, px, py, p1.x, p1.y, FORCEFIELD_HEIGHT);
    const p2Base = projectPropVertex(dummyProp, px, py, p2.x, p2.y, 0);
    const p2Top = projectPropVertex(dummyProp, px, py, p2.x, p2.y, FORCEFIELD_HEIGHT);
    ctx.save();
    ctx.lineCap = "round";
    // 1. Draw the laser barrier
    if (powered) {
        let glowColor = "rgba(239, 68, 68, 0.2)"; // Default color: red
        let strokeColor = "#ef4444"; // Default color: red
        if (mode === PASSAGE_MODE.Tripwire)
            if (tripped) {
                glowColor = "rgba(239, 68, 68, 0.35)";
                strokeColor = "#ef4444";
            } else {
                glowColor = "rgba(251, 146, 60, 0.25)";
                strokeColor = "#fb923c";
            }
        else if (mode === PASSAGE_MODE.OneWay) {
            const { x: ax, y: ay } = gridSideOutwardVector(allowedSide);
            const toViewerX = px - midX;
            const toViewerY = py - midY;
            const sideDot = toViewerX * ax + toViewerY * ay;
            if (sideDot < 0) {
                // Allowed side -> Green
                glowColor = "rgba(34, 197, 94, 0.25)";
                strokeColor = "#22c55e";
            } else {
                // Barred side -> Red
                glowColor = "rgba(239, 68, 68, 0.25)";
                strokeColor = "#ef4444";
            }
        }
        // Draw the semi-transparent vertical energy field quad
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.moveTo(p1Base.x, p1Base.y);
        ctx.lineTo(p2Base.x, p2Base.y);
        ctx.lineTo(p2Top.x, p2Top.y);
        ctx.lineTo(p1Top.x, p1Top.y);
        ctx.closePath();
        ctx.fill();
        // Draw horizontal laser beams
        const beamHeights = [2.0, 5.0, 8.0];
        for (const h of beamHeights) {
            const beamStart = projectPropVertex(dummyProp, px, py, p1.x, p1.y, h);
            const beamEnd = projectPropVertex(dummyProp, px, py, p2.x, p2.y, h);
            // Glow line (thick, semi-transparent)
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3.5 * lineScale;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.moveTo(beamStart.x, beamStart.y);
            ctx.lineTo(beamEnd.x, beamEnd.y);
            ctx.stroke();
            // Core line (thin, white/bright)
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.0 * lineScale;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.moveTo(beamStart.x, beamStart.y);
            ctx.lineTo(beamEnd.x, beamEnd.y);
            ctx.stroke();
        }
    } else {
        // Unpowered / disabled state: very faint horizontal dashed lines
        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.lineWidth = 1.2 * lineScale;
        ctx.setLineDash([4 * lineScale, 5 * lineScale]);
        const beamHeights = [2.0, 5.0, 8.0];
        for (const h of beamHeights) {
            const beamStart = projectPropVertex(dummyProp, px, py, p1.x, p1.y, h);
            const beamEnd = projectPropVertex(dummyProp, px, py, p2.x, p2.y, h);
            ctx.beginPath();
            ctx.moveTo(beamStart.x, beamStart.y);
            ctx.lineTo(beamEnd.x, beamEnd.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    // 2. Draw the two end posts (draw them over/after the laser barrier so they look clean)
    // Post styling
    ctx.strokeStyle = powered ? "#475569" : "#334155";
    ctx.lineWidth = 2.5 * lineScale;
    // Draw Post 1
    ctx.beginPath();
    ctx.moveTo(p1Base.x, p1Base.y);
    ctx.lineTo(p1Top.x, p1Top.y);
    ctx.stroke();
    // Draw Post 2
    ctx.beginPath();
    ctx.moveTo(p2Base.x, p2Base.y);
    ctx.lineTo(p2Top.x, p2Top.y);
    ctx.stroke();
    // Draw post caps (small circular accents on top)
    ctx.fillStyle = powered ? "#64748b" : "#475569";
    ctx.beginPath();
    ctx.arc(p1Top.x, p1Top.y, 1.8 * lineScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p2Top.x, p2Top.y, 1.8 * lineScale, 0, Math.PI * 2);
    ctx.fill();
    // 3. Draw directional arrow for One-Way mode on the center of the vertical energy field
    if (mode === PASSAGE_MODE.OneWay) {
        const { x: ax, y: ay } = gridSideOutwardVector(allowedSide);
        const arrowCenter = projectPropVertex(dummyProp, px, py, midX, midY, 5.0);
        drawDirectionalArrow(ctx, arrowCenter.x, arrowCenter.y, ax, ay, 6 * lineScale, powered ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.45)");
    }
    ctx.restore();
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
    const drawables = [];
    forEachGridEdge(
        grid,
        (col, row, side, edge) => {
            gridWallEdgeEndpoints(grid, col, row, side, EDGE_P1, EDGE_P2, 0);
            const midX = (EDGE_P1.x + EDGE_P2.x) * 0.5;
            const midY = (EDGE_P1.y + EDGE_P2.y) * 0.5;
            const distSq = (midX - px) ** 2 + (midY - py) ** 2;
            if (isPortalEdge(edge)) drawables.push({ type: "portal", col, row, side, edge, distSq });
            else drawables.push({ type: "forcefield", col, row, side, edge, p1: { x: EDGE_P1.x, y: EDGE_P1.y }, p2: { x: EDGE_P2.x, y: EDGE_P2.y }, midX, midY, distSq });
        },
        { minCol, maxCol, minRow, maxRow, canonicalOnly: true, filter: isForcefieldEdge },
    );
    drawables.sort((a, b) => b.distSq - a.distSq);
    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i];
        if (item.type === "portal") drawPortalEdgeStrip(ctx, grid, item.col, item.row, item.side, item.edge, px, py);
        else {
            const { col, row, side, edge, p1, p2, midX, midY } = item;
            const { mode, allowedSide, powered } = resolvePassageEdge(edge, side);
            const tripped = powered && tripwireTriggered.has(canonicalEdgeCellKey(grid, col, row, side));
            drawCool3DForcefield(ctx, px, py, p1, p2, mode, powered, tripped, lineScale, allowedSide, midX, midY);
        }
    }
    ctx.restore();
}
