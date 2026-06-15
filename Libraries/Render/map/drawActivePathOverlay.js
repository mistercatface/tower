/** @typedef {"normal" | "debug"} PathOverlayVisual */
import { getCanvasLineScale } from "../common/viewportUtils.js";
import { fillStrokeCircle, strokeCircle, strokeOpenPolyline } from "../../Canvas/CanvasPath.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { boundaryHopDrawGeometryBetweenWorldPoints } from "../../Pathfinding/boundaryNavHops.js";
/**
 * @typedef {Object} ActivePathOverlay
 * @property {"direct" | "hpa"} mode
 * @property {number} [targetX]
 * @property {number} [targetY]
 * @property {Array<{ x: number, y: number }>} [pathNodes]
 * @property {Array<{ x: number, y: number, id?: string }>} [abstractPath]
 * @property {"local" | "hpa"} [pathPlanner]
 */
const P1 = { x: 0, y: 0 };
const P2 = { x: 0, y: 0 };
function resolveBoundaryHopGeometries(grid, p1, p2) {
    return boundaryHopDrawGeometryBetweenWorldPoints(grid, p1, p2);
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
function drawPathPolyline(ctx, pathNodes, lineScale, grid, color) {
    if (pathNodes.length < 2) return;
    let currentSubPath = [pathNodes[0]];
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const p1 = pathNodes[i];
        const p2 = pathNodes[i + 1];
        const hop = resolveBoundaryHopGeometries(grid, p1, p2);
        if (hop) {
            currentSubPath.push(hop.entryMid);
            strokeSubPath(ctx, currentSubPath);
            drawPathArrowhead(ctx, hop.entryMid.x, hop.entryMid.y, hop.entryCross.x, hop.entryCross.y, color, lineScale);
            drawPathArrowhead(ctx, hop.exitMid.x, hop.exitMid.y, hop.exitVector.x, hop.exitVector.y, color, lineScale);
            currentSubPath = [hop.exitMid, p2];
        } else currentSubPath.push(p2);
    }
    strokeSubPath(ctx, currentSubPath);
}
function drawNormalPathOverlay(ctx, overlay, grid) {
    const { mode, targetX, targetY, pathNodes } = overlay;
    const lineScale = getCanvasLineScale(ctx);
    if (mode === "direct") {
        if (!pathNodes || pathNodes.length < 2) return;
        ctx.save();
        ctx.setLineDash([4 * lineScale, 4 * lineScale]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.55)";
        ctx.lineWidth = 1.5 * lineScale;
        strokeOpenPolyline(ctx, pathNodes);
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.85)";
        ctx.lineWidth = 2 * lineScale;
        const end = pathNodes[pathNodes.length - 1];
        strokeCircle(ctx, end.x, end.y, 4 * lineScale);
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(156, 39, 176, 0.65)";
    ctx.lineWidth = 2.5 * lineScale;
    if (pathNodes?.length) drawPathPolyline(ctx, pathNodes, lineScale, grid, "rgba(156, 39, 176, 0.9)");
    if (targetX != null && targetY != null) {
        ctx.strokeStyle = "rgba(156, 39, 176, 0.9)";
        ctx.lineWidth = 2 * lineScale;
        strokeCircle(ctx, targetX, targetY, 5 * lineScale);
    }
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
    const { mode, targetX, targetY, pathNodes, abstractPath, pathPlanner } = overlay;
    if (mode === "hpa") {
        if (abstractPath) drawAbstractPath(ctx, abstractPath, zoom, pathPlanner ?? "hpa");
        if (pathNodes?.length >= 2) {
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 4 / zoom;
            const lineScale = 1 / zoom;
            drawPathPolyline(ctx, pathNodes, lineScale, grid, "#00e5ff");
        }
        if (pathNodes?.length)
            for (const wp of pathNodes) {
                ctx.fillStyle = "#00e5ff";
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1.5 / zoom;
                fillStrokeCircle(ctx, wp.x, wp.y, 6 / zoom);
            }
        if (targetX != null && targetY != null) {
            ctx.fillStyle = "rgba(156, 39, 176, 0.85)";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2 / zoom;
            fillStrokeCircle(ctx, targetX, targetY, 5 / zoom);
        }
        return;
    }
    if (!pathNodes || pathNodes.length < 2) return;
    ctx.strokeStyle = "rgba(0, 188, 212, 0.65)";
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([8 / zoom, 6 / zoom]);
    strokeOpenPolyline(ctx, pathNodes);
    ctx.setLineDash([]);
    const end = pathNodes[pathNodes.length - 1];
    drawPathMarker(ctx, end.x, end.y, 10 / zoom, "rgba(0, 188, 212, 0.85)", null, zoom);
}
