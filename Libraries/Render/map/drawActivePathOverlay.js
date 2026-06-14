/** @typedef {"normal" | "debug"} PathOverlayVisual */
import { getCanvasLineScale } from "../common/viewportUtils.js";
import { fillStrokeCircle, strokeCircle, strokeOpenPolyline, strokePolylineFrom, strokeSegment } from "../../Canvas/CanvasPath.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { isPortalEdge } from "../../Spatial/grid/CellEdge.js";
import { resolvePortalPartner } from "../../Sandbox/portalLinks.js";
import { portalMouthAndBackCells, portalTraverseExitCell, portalTraverseExitVector, portalCrossingVectorForEdge, resolveCardinalStepCrossing } from "../../Spatial/grid/portalAccess.js";
import { gridWallEdgeEndpoints } from "../../World/wallGridCells.js";
/**
 * @typedef {Object} ActivePathOverlay
 * @property {"direct" | "hpa"} mode
 * @property {number} fromX
 * @property {number} fromY
 * @property {number} targetX
 * @property {number} targetY
 * @property {Array<{ x: number, y: number }>} [waypoints]
 * @property {Array<{ x: number, y: number, id?: string }>} [abstractPath]
 * @property {"local" | "hpa"} [pathPlanner]
 */
const P1 = { x: 0, y: 0 };
const P2 = { x: 0, y: 0 };
function resolvePortalHopGeometries(grid, p1, p2) {
    if (!grid) return null;
    const c1 = grid.worldToGrid(p1.x, p1.y);
    const c2 = grid.worldToGrid(p2.x, p2.y);
    if (!cellInRect(c1.col, c1.row, grid.cols, grid.rows) || !cellInRect(c2.col, c2.row, grid.cols, grid.rows)) return null;
    // Check grid distance to see if it's a jump
    const gridDist = Math.max(Math.abs(c1.col - c2.col), Math.abs(c1.row - c2.row));
    if (gridDist <= 1.5) return null;
    // Find a portal hop from c1.col, c1.row that ends near c2.col, c2.row
    const hops = grid.getPortalHops(c1.col, c1.row);
    if (!hops) return null;
    for (const hop of hops) {
        const distToExit = Math.max(Math.abs(hop.exitCol - c2.col), Math.abs(hop.exitRow - c2.row));
        if (distToExit <= 1) {
            // Find the cardinal neighbor toCol, toRow that leads to this exit
            const CARDINAL_OFFSETS = [
                { dc: 0, dr: -1 }, // N
                { dc: 1, dr: 0 }, // E
                { dc: 0, dr: 1 }, // S
                { dc: -1, dr: 0 }, // W
            ];
            for (const offset of CARDINAL_OFFSETS) {
                const toCol = hop.mouthCol + offset.dc;
                const toRow = hop.mouthRow + offset.dr;
                if (!cellInRect(toCol, toRow, grid.cols, grid.rows)) continue;
                const crossing = resolveCardinalStepCrossing(hop.mouthCol, hop.mouthRow, toCol, toRow);
                if (!crossing) continue;
                const edge = grid.edgeStore.get(crossing.ownerCol, crossing.ownerRow, crossing.ownerSide, grid.cols);
                if (edge && isPortalEdge(edge)) {
                    const partner = resolvePortalPartner(grid, crossing.ownerCol, crossing.ownerRow, crossing.ownerSide);
                    if (partner) {
                        const exit = portalTraverseExitCell(grid, partner.col, partner.row, partner.side);
                        if (exit.col === hop.exitCol && exit.row === hop.exitRow) {
                            // Found the portal hop edges!
                            // Entrance Portal midpoint:
                            gridWallEdgeEndpoints(grid, crossing.ownerCol, crossing.ownerRow, crossing.ownerSide, P1, P2, 0);
                            const entryMidX = (P1.x + P2.x) * 0.5;
                            const entryMidY = (P1.y + P2.y) * 0.5;
                            const entryCross = portalCrossingVectorForEdge(edge, crossing.ownerCol, crossing.ownerRow, crossing.ownerSide);
                            // Exit Portal midpoint:
                            gridWallEdgeEndpoints(grid, partner.col, partner.row, partner.side, P1, P2, 0);
                            const exitMidX = (P1.x + P2.x) * 0.5;
                            const exitMidY = (P1.y + P2.y) * 0.5;
                            const exitVector = portalTraverseExitVector(grid, partner.col, partner.row, partner.side);
                            return { entryMid: { x: entryMidX, y: entryMidY }, entryCross, exitMid: { x: exitMidX, y: exitMidY }, exitVector };
                        }
                    }
                }
            }
        }
    }
    return null;
}
function drawPathArrowhead(ctx, x, y, vx, vy, color, lineScale) {
    const headSize = 9 * lineScale;
    const headWidth = 6 * lineScale;
    const tx = -vy;
    const ty = vx;
    const baseCenterX = x - vx * headSize;
    const baseCenterY = y - vy * headSize;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(baseCenterX + tx * headWidth, baseCenterY + ty * headWidth);
    ctx.lineTo(baseCenterX - tx * headWidth, baseCenterY - ty * headWidth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
function strokeSubPath(ctx, points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
}
function drawPathPolyline(ctx, fromX, fromY, waypoints, targetX, targetY, lineScale, grid, color) {
    const allPoints = [{ x: fromX, y: fromY }, ...(waypoints ?? [])];
    const last = allPoints[allPoints.length - 1];
    if (!last || Math.hypot(last.x - targetX, last.y - targetY) > 0.5) allPoints.push({ x: targetX, y: targetY });
    if (allPoints.length < 2) return;
    let currentSubPath = [allPoints[0]];
    for (let i = 0; i < allPoints.length - 1; i++) {
        const p1 = allPoints[i];
        const p2 = allPoints[i + 1];
        const hop = resolvePortalHopGeometries(grid, p1, p2);
        if (hop) {
            // Complete current sub-path at entryMid
            currentSubPath.push(hop.entryMid);
            strokeSubPath(ctx, currentSubPath);
            // Draw arrowheads
            drawPathArrowhead(ctx, hop.entryMid.x, hop.entryMid.y, hop.entryCross.x, hop.entryCross.y, color, lineScale);
            drawPathArrowhead(ctx, hop.exitMid.x, hop.exitMid.y, hop.exitVector.x, hop.exitVector.y, color, lineScale);
            // Start a new sub-path at exitMid
            currentSubPath = [hop.exitMid, p2];
        } else currentSubPath.push(p2);
    }
    strokeSubPath(ctx, currentSubPath);
}
function drawNormalPathOverlay(ctx, overlay, grid) {
    const { mode, fromX, fromY, targetX, targetY, waypoints } = overlay;
    const lineScale = getCanvasLineScale(ctx);
    if (mode === "direct") {
        ctx.save();
        ctx.setLineDash([4 * lineScale, 4 * lineScale]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.55)";
        ctx.lineWidth = 1.5 * lineScale;
        strokeSegment(ctx, fromX, fromY, targetX, targetY);
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.85)";
        ctx.lineWidth = 2 * lineScale;
        strokeCircle(ctx, targetX, targetY, 4 * lineScale);
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(156, 39, 176, 0.65)";
    ctx.lineWidth = 2.5 * lineScale;
    drawPathPolyline(ctx, fromX, fromY, waypoints, targetX, targetY, lineScale, grid, "rgba(156, 39, 176, 0.9)");
    ctx.strokeStyle = "rgba(156, 39, 176, 0.9)";
    ctx.lineWidth = 2 * lineScale;
    strokeCircle(ctx, targetX, targetY, 5 * lineScale);
    ctx.restore();
}
function drawPathMarker(ctx, x, y, radius, fillStyle, label, zoom) {
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3 / zoom;
    fillStrokeCircle(ctx, x, y, radius);
    if (label) {
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${16 / zoom}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y);
    }
}
function drawAbstractPath(ctx, abstractPath, zoom, pathPlanner = "hpa") {
    if (!abstractPath || abstractPath.length < 2) return;
    const isLocal = pathPlanner === "local";
    const lineColor = isLocal ? "#ff9800" : "#ffeb3b";
    const nodeColor = isLocal ? "#ffb74d" : "#ffeb3b";
    const endpointColor = isLocal ? "#f57c00" : "#ff9800";
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 5 / zoom;
    ctx.setLineDash([12 / zoom, 8 / zoom]);
    strokeOpenPolyline(ctx, abstractPath);
    ctx.setLineDash([]);
    for (const node of abstractPath) {
        const isEndpoint = node.id === "start" || node.id === "target";
        const radius = (isEndpoint ? 8 : 10) / zoom;
        ctx.fillStyle = isEndpoint ? endpointColor : nodeColor;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 / zoom;
        fillStrokeCircle(ctx, node.x, node.y, radius);
    }
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ActivePathOverlay} overlay
 * @param {number} zoom
 * @param {PathOverlayVisual} [visual]
 * @param {object} [grid]
 */
export function drawActivePathOverlay(ctx, overlay, zoom, visual = "debug", grid = null) {
    if (visual === "normal") {
        drawNormalPathOverlay(ctx, overlay, grid);
        return;
    }
    const { mode, fromX, fromY, targetX, targetY, waypoints, abstractPath, pathPlanner } = overlay;
    if (mode === "hpa") {
        if (abstractPath) drawAbstractPath(ctx, abstractPath, zoom, pathPlanner ?? "hpa");
        if (waypoints?.length) {
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 4 / zoom;
            const lineScale = 1 / zoom;
            drawPathPolyline(ctx, fromX, fromY, waypoints, targetX, targetY, lineScale, grid, "#00e5ff");
            for (const wp of waypoints) {
                ctx.fillStyle = "#00e5ff";
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1.5 / zoom;
                fillStrokeCircle(ctx, wp.x, wp.y, 6 / zoom);
            }
        }
        return;
    }
    ctx.strokeStyle = "rgba(0, 188, 212, 0.65)";
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([8 / zoom, 6 / zoom]);
    strokeSegment(ctx, fromX, fromY, targetX, targetY);
    ctx.setLineDash([]);
    drawPathMarker(ctx, targetX, targetY, 10 / zoom, "rgba(0, 188, 212, 0.85)", null, zoom);
}
