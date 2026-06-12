/** @typedef {"normal" | "debug"} PathOverlayVisual */
import { getCanvasLineScale } from "../common/viewportUtils.js";
import { fillStrokeCircle, strokeCircle, strokeOpenPolyline, strokePolylineFrom, strokeSegment } from "../../Canvas/CanvasPath.js";
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
function drawNormalPathOverlay(ctx, overlay) {
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
    strokePolylineFrom(ctx, fromX, fromY, waypoints, targetX, targetY);
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
 */
export function drawActivePathOverlay(ctx, overlay, zoom, visual = "debug") {
    if (visual === "normal") {
        drawNormalPathOverlay(ctx, overlay);
        return;
    }
    const { mode, fromX, fromY, targetX, targetY, waypoints, abstractPath, pathPlanner } = overlay;
    if (mode === "hpa") {
        if (abstractPath) drawAbstractPath(ctx, abstractPath, zoom, pathPlanner ?? "hpa");
        if (waypoints?.length) {
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 4 / zoom;
            strokePolylineFrom(ctx, fromX, fromY, waypoints, targetX, targetY);
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
