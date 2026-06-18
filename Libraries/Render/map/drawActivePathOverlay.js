/** @typedef {"normal" | "debug"} PathOverlayVisual */
import { getCanvasLineScale } from "../common/viewportUtils.js";
import { fillStrokeCircle, strokeCircle, strokeOpenPolyline, strokeSegment } from "../../Canvas/CanvasPath.js";
/** @typedef {Object} ActivePathOverlay
 * @property {"direct" | "hpa" | "flow"} mode
 * @property {number} [propX]
 * @property {number} [propY]
 * @property {number} [propRadius]
 * @property {number} [dirX]
 * @property {number} [dirY]
 * @property {number} [targetX]
 * @property {number} [targetY]
 * @property {Array<{ x: number, y: number }>} [pathNodes]
 * @property {Array<{ x: number, y: number, id?: string }>} [abstractPath]
 * @property {"local" | "hpa"} [pathPlanner]
 */
const P1 = { x: 0, y: 0 };
const P2 = { x: 0, y: 0 };
function unitVector(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return null;
    return { x: dx / len, y: dy / len };
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
    strokeSubPath(ctx, pathNodes);
}
function drawPathEndArrow(ctx, pathNodes, targetX, targetY, color, lineScale) {
    if (targetX != null && targetY != null && pathNodes?.length >= 1) {
        const from = pathNodes[pathNodes.length - 1];
        const dir = unitVector(from.x, from.y, targetX, targetY);
        if (dir) {
            drawPathArrowhead(ctx, targetX, targetY, dir.x, dir.y, color, lineScale);
            return;
        }
    }
    if (pathNodes?.length >= 2) {
        const n = pathNodes.length;
        const tip = pathNodes[n - 1];
        const dir = unitVector(pathNodes[n - 2].x, pathNodes[n - 2].y, tip.x, tip.y);
        if (dir) drawPathArrowhead(ctx, tip.x, tip.y, dir.x, dir.y, color, lineScale);
    }
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
    if (mode === "flow") {
        drawFlowAgentArrow(ctx, overlay, lineScale);
        return;
    }
    ctx.save();
    const hpaColor = "rgba(156, 39, 176, 0.9)";
    ctx.strokeStyle = "rgba(156, 39, 176, 0.65)";
    ctx.lineWidth = 2.5 * lineScale;
    if (pathNodes?.length) drawPathPolyline(ctx, pathNodes, lineScale, grid, hpaColor);
    if (pathNodes?.length || (targetX != null && targetY != null)) {
        ctx.strokeStyle = hpaColor;
        ctx.lineWidth = 2 * lineScale;
        drawPathEndArrow(ctx, pathNodes, targetX, targetY, hpaColor, lineScale);
    }
    ctx.restore();
}
function drawFlowTargetMarker(ctx, x, y, lineScale, ready) {
    ctx.fillStyle = ready ? "rgba(129, 199, 132, 0.95)" : "rgba(255, 193, 7, 0.85)";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5 * lineScale;
    fillStrokeCircle(ctx, x, y, 4 * lineScale);
}
function drawFlowAgentArrow(ctx, overlay, lineScale) {
    const { propX, propY, propRadius, dirX, dirY, targetX, targetY } = overlay;
    if (propX == null || propY == null) return;
    ctx.save();
    if (dirX != null && dirY != null) {
        const pad = (propRadius ?? 8) + 5 * lineScale;
        const arrowLen = 20 * lineScale;
        const startX = propX + dirX * pad;
        const startY = propY + dirY * pad;
        const tipX = startX + dirX * arrowLen;
        const tipY = startY + dirY * arrowLen;
        const color = "rgba(76, 175, 80, 0.85)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * lineScale;
        strokeSegment(ctx, startX, startY, tipX, tipY);
        drawPathArrowhead(ctx, tipX, tipY, dirX, dirY, color, lineScale);
    } else if (targetX != null && targetY != null) drawFlowTargetMarker(ctx, targetX, targetY, lineScale, false);
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
 * @param {import("../../Viewport/Viewport.js").Viewport} [viewport]
 */
export function drawActivePathOverlay(ctx, overlay, zoom, visual = "debug", grid = null, viewport = null) {
    if (visual === "normal") {
        drawNormalPathOverlay(ctx, overlay, grid);
        return;
    }
    const { mode, targetX, targetY, pathNodes, abstractPath, pathPlanner } = overlay;
    if (mode === "hpa") {
        if (abstractPath) drawAbstractPath(ctx, abstractPath, zoom, pathPlanner ?? "hpa");
        const lineScale = 1 / zoom;
        if (pathNodes?.length >= 2) {
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 4 / zoom;
            drawPathPolyline(ctx, pathNodes, lineScale, grid, "#00e5ff");
        }
        if (pathNodes?.length >= 1) drawPathEndArrow(ctx, pathNodes, targetX, targetY, "rgba(156, 39, 176, 0.9)", lineScale);
        if (pathNodes?.length)
            for (let i = 0; i < pathNodes.length; i++) {
                const wp = pathNodes[i];
                ctx.fillStyle = "#00e5ff";
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1.5 / zoom;
                fillStrokeCircle(ctx, wp.x, wp.y, 6 / zoom);
            }
        return;
    }
    if (mode === "flow") {
        drawFlowAgentArrow(ctx, overlay, 1 / zoom);
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
