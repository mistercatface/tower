import { fillCircle, fillClosedPolygon, strokeCircle, strokeSegment } from "../Canvas/CanvasPath.js";
import { lengthXY, normalizeXY } from "../Math/Vec2.js";
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x1: number, y1: number, x2: number, y2: number }} segment
 * @param {{ color?: string, lineWidth?: number, arrowhead?: boolean, glow?: boolean, glowHue?: number }} [style]
 */
export function drawAimSegment(ctx, { x1, y1, x2, y2 }, { color = "#00e5ff", lineWidth = 3, arrowhead = true, glow = true, glowHue = 180 } = {}) {
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
        const tx = -ny;
        const ty = nx;
        const headSize = 8;
        const headWidth = 5;
        const baseCenterX = x2 - nx * headSize;
        const baseCenterY = y2 - ny * headSize;
        ctx.fillStyle = color;
        fillClosedPolygon(ctx, [
            { x: x2, y: y2 },
            { x: baseCenterX + tx * headWidth, y: baseCenterY + ty * headWidth },
            { x: baseCenterX - tx * headWidth, y: baseCenterY - ty * headWidth },
        ]);
    }
    ctx.restore();
}
