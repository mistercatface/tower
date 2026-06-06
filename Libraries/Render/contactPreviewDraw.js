/**
 * @typedef {import("../Spatial/query/contactPreview.js").BodyContactPreview} BodyContactPreview
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x1: number, y1: number, x2: number, y2: number }} segment
 * @param {string} color
 * @param {{ lineWidth?: number, dashed?: boolean, arrowhead?: boolean, glow?: boolean, glowHue?: number }} [style]
 */
function drawContactSegment(ctx, segment, color, { lineWidth = 3, dashed = false, arrowhead = false, glow = false, glowHue = 0 } = {}) {
    const { x1, y1, x2, y2 } = segment;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;

    ctx.save();
    if (glow) {
        ctx.shadowColor = `hsla(${glowHue}, 100%, 50%, 0.6)`;
        ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.setLineDash([]);

    if (arrowhead) {
        const nx = dx / len;
        const ny = dy / len;
        const tx = -ny;
        const ty = nx;
        const headSize = 8;
        const headWidth = 5;
        const baseCenterX = x2 - nx * headSize;
        const baseCenterY = y2 - ny * headSize;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(baseCenterX + tx * headWidth, baseCenterY + ty * headWidth);
        ctx.lineTo(baseCenterX - tx * headWidth, baseCenterY - ty * headWidth);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {BodyContactPreview} preview
 * @param {{
 *   primaryColor?: string,
 *   secondaryColor?: string,
 *   circleHitColor?: string,
 *   secondaryLength?: number,
 *   primaryGlowHue?: number,
 * }} [style]
 */
export function drawBodyContactPreview(ctx, preview, { primaryColor = "#00e5ff", secondaryColor = null, circleHitColor = "rgba(255, 220, 80, 0.9)", secondaryLength = 80, primaryGlowHue = 180 } = {}) {
    drawContactSegment(ctx, preview.primary, primaryColor, { lineWidth: 3, arrowhead: true, glow: true, glowHue: primaryGlowHue });

    if (!preview.secondary) return;

    const { x1, y1, x2, y2, kind } = preview.secondary;
    const color = kind === "circle" ? circleHitColor : (secondaryColor ?? primaryColor);
    const dx = x2 - x1;
    const dy = y2 - y1;
    let segX2 = x2;
    let segY2 = y2;
    const len = Math.hypot(dx, dy);
    if (len < 0.5 && secondaryLength > 0) {
        segX2 = x1 + (dx / (len || 1)) * secondaryLength;
        segY2 = y1 + (dy / (len || 1)) * secondaryLength;
    }
    drawContactSegment(ctx, { x1, y1, x2: segX2, y2: segY2 }, color, {
        lineWidth: 2.5,
        dashed: kind === "wall",
        arrowhead: true,
        glow: true,
        glowHue: primaryGlowHue,
    });
}
