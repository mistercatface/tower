import { fillClosedPolygon, fillStrokeCircle, strokeCircle, strokeOpenPolyline, strokeSegment, traceAabbRect } from "../../Canvas/CanvasPath.js";
import { lengthXY, normalizeXY } from "../../Math/Vec2.js";
function drawArrowHead(ctx, x, y, dirX, dirY, fill, headLen, headWidth) {
    const tx = -dirY;
    const ty = dirX;
    const baseCenterX = x - dirX * headLen;
    const baseCenterY = y - dirY * headLen;
    ctx.fillStyle = fill;
    fillClosedPolygon(ctx, [
        { x, y },
        { x: baseCenterX + tx * headWidth, y: baseCenterY + ty * headWidth },
        { x: baseCenterX - tx * headWidth, y: baseCenterY - ty * headWidth },
    ]);
}
function drawAabbCommand(ctx, cmd) {
    const { minX, minY, maxX, maxY, fill, stroke, lineWidth = 1, dash } = cmd;
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }
    if (!stroke) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    if (dash?.length) ctx.setLineDash(dash);
    ctx.beginPath();
    traceAabbRect(ctx, cmd);
    ctx.stroke();
    if (dash?.length) ctx.setLineDash([]);
}
function drawAimSegmentCommand(ctx, cmd) {
    const { x1, y1, x2, y2, color, lineWidth = 3, arrowhead = true, glow = true, glowHue = 180 } = cmd;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (lengthXY(dx, dy) < 0.5) return;
    ctx.save();
    if (glow) {
        ctx.shadowColor = `hsla(${glowHue}, 100%, 50%, 0.6)`;
        ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    strokeSegment(ctx, x1, y1, x2, y2);
    if (arrowhead) {
        const { nx, ny } = normalizeXY(dx, dy);
        drawArrowHead(ctx, x2, y2, nx, ny, color, 8, 5);
    }
    ctx.restore();
}
export function drawOverlayCommands(ctx, commands) {
    if (!commands?.length) return;
    ctx.save();
    for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        if (cmd.kind === "aabb") {
            drawAabbCommand(ctx, cmd);
            continue;
        }
        if (cmd.kind === "circleStroke") {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeCircle(ctx, cmd.cx, cmd.cy, cmd.r);
            if (cmd.dash?.length) ctx.setLineDash([]);
            continue;
        }
        if (cmd.kind === "circleFillStroke") {
            ctx.fillStyle = cmd.fill;
            ctx.strokeStyle = cmd.stroke ?? "#fff";
            ctx.lineWidth = cmd.lineWidth ?? 1;
            fillStrokeCircle(ctx, cmd.cx, cmd.cy, cmd.r);
            continue;
        }
        if (cmd.kind === "segment") {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.lineCap) ctx.lineCap = cmd.lineCap;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeSegment(ctx, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
            if (cmd.dash?.length) ctx.setLineDash([]);
            if (cmd.lineCap) ctx.lineCap = "butt";
            continue;
        }
        if (cmd.kind === "polyline") {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeOpenPolyline(ctx, cmd.points);
            if (cmd.dash?.length) ctx.setLineDash([]);
            continue;
        }
        if (cmd.kind === "arrowHead") {
            drawArrowHead(ctx, cmd.x, cmd.y, cmd.dirX, cmd.dirY, cmd.fill, cmd.headLen ?? 9, cmd.headWidth ?? 6);
            continue;
        }
        if (cmd.kind === "aimSegment") drawAimSegmentCommand(ctx, cmd);
    }
    ctx.restore();
}
