/** Draw a combat beam or a subtle laser-sight preview line. */
export function drawLaserBeam(ctx, x1, y1, x2, y2, color = "#ff0000", isSight = false) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (isSight) {
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        let rgb = "255, 0, 0";
        if (color === "#00ff00") rgb = "0, 255, 0";
        const peakAlpha = 0.15;
        grad.addColorStop(0.0, `rgba(${rgb}, 0)`);
        grad.addColorStop(0.15, `rgba(${rgb}, ${peakAlpha})`);
        grad.addColorStop(1.0, `rgba(${rgb}, ${peakAlpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.0;
        ctx.stroke();
    } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    ctx.restore();
}
