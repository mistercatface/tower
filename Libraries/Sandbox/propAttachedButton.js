/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {boolean} pressed @param {number} radius */
export function drawPropAttachedButton(ctx, x, y, pressed, radius) {
    const r = radius;
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pressed ? 0.88 : 1, pressed ? 0.88 : 1);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    grad.addColorStop(0, pressed ? "#FFAB91" : "#FF7043");
    grad.addColorStop(1, pressed ? "#BF360C" : "#E64A19");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3E2723";
    ctx.lineWidth = 2.5 * lineScale;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.5 * lineScale;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
