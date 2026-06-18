/** @typedef {"normal" | "debug"} PathOverlayVisual */
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
const FLOW_ARROW_LEN = 20;
const FLOW_ARROW_PAD = 5;
const PATH_STROKE_WIDTH = 2;
const HPA_STROKE_WIDTH = 2.5;
const ARROW_HEAD_LEN = 9;
const ARROW_HEAD_WIDTH = 6;
function unitVector(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return null;
    return { x: dx / len, y: dy / len };
}
function drawPathArrowhead(ctx, x, y, vx, vy, color) {
    const tx = -vy;
    const ty = vx;
    const baseCenterX = x - vx * ARROW_HEAD_LEN;
    const baseCenterY = y - vy * ARROW_HEAD_LEN;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(baseCenterX + tx * ARROW_HEAD_WIDTH, baseCenterY + ty * ARROW_HEAD_WIDTH);
    ctx.lineTo(baseCenterX - tx * ARROW_HEAD_WIDTH, baseCenterY - ty * ARROW_HEAD_WIDTH);
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
function drawPathPolyline(ctx, pathNodes) {
    if (pathNodes.length < 2) return;
    strokeSubPath(ctx, pathNodes);
}
function drawPathEndArrow(ctx, pathNodes, targetX, targetY, color) {
    if (targetX != null && targetY != null && pathNodes?.length >= 1) {
        const from = pathNodes[pathNodes.length - 1];
        const dir = unitVector(from.x, from.y, targetX, targetY);
        if (dir) {
            drawPathArrowhead(ctx, targetX, targetY, dir.x, dir.y, color);
            return;
        }
    }
    if (pathNodes?.length >= 2) {
        const n = pathNodes.length;
        const tip = pathNodes[n - 1];
        const dir = unitVector(pathNodes[n - 2].x, pathNodes[n - 2].y, tip.x, tip.y);
        if (dir) drawPathArrowhead(ctx, tip.x, tip.y, dir.x, dir.y, color);
    }
}
function drawNormalPathOverlay(ctx, overlay) {
    const { mode, targetX, targetY, pathNodes } = overlay;
    if (mode === "direct") {
        if (!pathNodes || pathNodes.length < 2) return;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.55)";
        ctx.lineWidth = 1.5;
        strokeOpenPolyline(ctx, pathNodes);
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.85)";
        ctx.lineWidth = PATH_STROKE_WIDTH;
        const end = pathNodes[pathNodes.length - 1];
        strokeCircle(ctx, end.x, end.y, 4);
        ctx.restore();
        return;
    }
    if (mode === "flow") {
        drawFlowAgentArrow(ctx, overlay);
        return;
    }
    ctx.save();
    const hpaColor = "rgba(156, 39, 176, 0.9)";
    ctx.strokeStyle = "rgba(156, 39, 176, 0.65)";
    ctx.lineWidth = HPA_STROKE_WIDTH;
    if (pathNodes?.length) drawPathPolyline(ctx, pathNodes);
    if (pathNodes?.length || (targetX != null && targetY != null)) {
        ctx.strokeStyle = hpaColor;
        ctx.lineWidth = PATH_STROKE_WIDTH;
        drawPathEndArrow(ctx, pathNodes, targetX, targetY, hpaColor);
    }
    ctx.restore();
}
function drawFlowTargetMarker(ctx, x, y, ready) {
    ctx.fillStyle = ready ? "rgba(129, 199, 132, 0.95)" : "rgba(255, 193, 7, 0.85)";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    fillStrokeCircle(ctx, x, y, 4);
}
function drawFlowAgentArrow(ctx, overlay) {
    const { propX, propY, propRadius, dirX, dirY, targetX, targetY } = overlay;
    if (propX == null || propY == null) return;
    ctx.save();
    if (dirX != null && dirY != null) {
        const pad = (propRadius ?? 8) + FLOW_ARROW_PAD;
        const startX = propX + dirX * pad;
        const startY = propY + dirY * pad;
        const tipX = startX + dirX * FLOW_ARROW_LEN;
        const tipY = startY + dirY * FLOW_ARROW_LEN;
        const color = "rgba(76, 175, 80, 0.85)";
        ctx.strokeStyle = color;
        ctx.lineWidth = PATH_STROKE_WIDTH;
        strokeSegment(ctx, startX, startY, tipX, tipY);
        drawPathArrowhead(ctx, tipX, tipY, dirX, dirY, color);
    } else if (targetX != null && targetY != null) drawFlowTargetMarker(ctx, targetX, targetY, false);
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
 */
export function drawActivePathOverlay(ctx, overlay, zoom, visual = "debug") {
    if (visual === "normal") {
        drawNormalPathOverlay(ctx, overlay);
        return;
    }
    const { mode, targetX, targetY, pathNodes, abstractPath, pathPlanner } = overlay;
    if (mode === "hpa") {
        if (abstractPath) drawAbstractPath(ctx, abstractPath, zoom, pathPlanner ?? "hpa");
        if (pathNodes?.length >= 2) {
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 4;
            drawPathPolyline(ctx, pathNodes);
        }
        if (pathNodes?.length >= 1) drawPathEndArrow(ctx, pathNodes, targetX, targetY, "rgba(156, 39, 176, 0.9)");
        if (pathNodes?.length)
            for (let i = 0; i < pathNodes.length; i++) {
                const wp = pathNodes[i];
                ctx.fillStyle = "#00e5ff";
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1.5;
                fillStrokeCircle(ctx, wp.x, wp.y, 6);
            }
        return;
    }
    if (mode === "flow") {
        drawFlowAgentArrow(ctx, overlay);
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
