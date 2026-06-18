import { fillClosedPolygon, fillStrokeCircle, strokeCircle, strokeSegment, traceAabbRect } from "../../Canvas/CanvasPath.js";
function drawArrowHeadAt(ctx, tipX, tipY, dirX, dirY, fill, headLen, headWidth) {
    const tx = -dirY;
    const ty = dirX;
    const baseCenterX = tipX - dirX * headLen;
    const baseCenterY = tipY - dirY * headLen;
    ctx.fillStyle = fill;
    fillClosedPolygon(ctx, [
        { x: tipX, y: tipY },
        { x: baseCenterX + tx * headWidth, y: baseCenterY + ty * headWidth },
        { x: baseCenterX - tx * headWidth, y: baseCenterY - ty * headWidth },
    ]);
}
export function bakeOverlayCommand(ctx, anchorX, anchorY, cmd) {
    if (cmd.kind === "circleStroke") {
        ctx.strokeStyle = cmd.stroke;
        ctx.lineWidth = cmd.lineWidth ?? 1;
        if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
        strokeCircle(ctx, anchorX, anchorY, cmd.r);
        if (cmd.dash?.length) ctx.setLineDash([]);
        return;
    }
    if (cmd.kind === "circleFillStroke") {
        ctx.fillStyle = cmd.fill;
        ctx.strokeStyle = cmd.stroke ?? "#fff";
        ctx.lineWidth = cmd.lineWidth ?? 1;
        fillStrokeCircle(ctx, anchorX, anchorY, cmd.r);
        return;
    }
    if (cmd.kind === "arrowHead") {
        drawArrowHeadAt(ctx, anchorX, anchorY, cmd.dirX, cmd.dirY, cmd.fill, cmd.headLen ?? 9, cmd.headWidth ?? 6);
        return;
    }
    if (cmd.kind === "directionArrow") {
        const { dirX, dirY, pad, len, stroke, lineWidth = 2, headLen = 9, headWidth = 6 } = cmd;
        const startX = anchorX + dirX * pad;
        const startY = anchorY + dirY * pad;
        const tipX = startX + dirX * len;
        const tipY = startY + dirY * len;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        strokeSegment(ctx, startX, startY, tipX, tipY);
        drawArrowHeadAt(ctx, tipX, tipY, dirX, dirY, stroke, headLen, headWidth);
        return;
    }
    if (cmd.kind === "aabb") {
        const w = cmd.maxX - cmd.minX;
        const h = cmd.maxY - cmd.minY;
        const minX = anchorX - w * 0.5;
        const minY = anchorY - h * 0.5;
        const rect = { minX, minY, maxX: minX + w, maxY: minY + h };
        const { fill, stroke, lineWidth = 1, dash } = cmd;
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fillRect(rect.minX, rect.minY, w, h);
        }
        if (!stroke) return;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        if (dash?.length) ctx.setLineDash(dash);
        ctx.beginPath();
        traceAabbRect(ctx, rect);
        ctx.stroke();
        if (dash?.length) ctx.setLineDash([]);
    }
}
