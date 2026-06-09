/** @typedef {"normal" | "debug"} PathOverlayVisual */
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
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    if (mode === "direct") {
        ctx.save();
        ctx.setLineDash([4 * lineScale, 4 * lineScale]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.55)";
        ctx.lineWidth = 1.5 * lineScale;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(0, 188, 212, 0.85)";
        ctx.lineWidth = 2 * lineScale;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 4 * lineScale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(156, 39, 176, 0.65)";
    ctx.lineWidth = 2.5 * lineScale;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    if (waypoints?.length) for (const wp of waypoints) ctx.lineTo(wp.x, wp.y);
    else ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(156, 39, 176, 0.9)";
    ctx.lineWidth = 2 * lineScale;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 5 * lineScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
function drawPathMarker(ctx, x, y, radius, fillStyle, label, zoom) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3 / zoom;
    ctx.fill();
    ctx.stroke();
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
    ctx.beginPath();
    ctx.moveTo(abstractPath[0].x, abstractPath[0].y);
    for (let i = 1; i < abstractPath.length; i++) ctx.lineTo(abstractPath[i].x, abstractPath[i].y);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 5 / zoom;
    ctx.setLineDash([12 / zoom, 8 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const node of abstractPath) {
        const isEndpoint = node.id === "start" || node.id === "target";
        const radius = (isEndpoint ? 8 : 10) / zoom;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isEndpoint ? endpointColor : nodeColor;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
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
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            for (const wp of waypoints) ctx.lineTo(wp.x, wp.y);
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 4 / zoom;
            ctx.stroke();
            for (const wp of waypoints) {
                ctx.beginPath();
                ctx.arc(wp.x, wp.y, 6 / zoom, 0, Math.PI * 2);
                ctx.fillStyle = "#00e5ff";
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1.5 / zoom;
                ctx.stroke();
            }
        }
        return;
    }
    ctx.strokeStyle = "rgba(0, 188, 212, 0.65)";
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([8 / zoom, 6 / zoom]);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPathMarker(ctx, targetX, targetY, 10 / zoom, "rgba(0, 188, 212, 0.85)", null, zoom);
}
