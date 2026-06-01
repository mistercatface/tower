export const RenderSprites = {
    enemy: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2.5) * 2;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        offCtx.fillStyle = color;
        offCtx.fill();
        return offCanvas;
    },

    turret: (scale, explicitColor) => {
        const margin = Math.max(2, scale);
        const cx = Math.ceil(2 * scale + margin);
        const cy = Math.ceil(2.5 * scale + margin);
        const W = Math.ceil(cx + 4 * scale + margin);
        const H = Math.ceil(cy + 2.5 * scale + margin);

        const offCanvas = new OffscreenCanvas(W, H);
        const offCtx = offCanvas.getContext("2d");

        offCtx.save();
        offCtx.translate(cx, cy);
        offCtx.scale(scale, scale);

        const turretPoints = [
            { x: 4, y: 0 },
            { x: -2, y: 2.5 },
            { x: -2, y: -2.5 },
            { x: 4, y: 0 },
        ];

        offCtx.beginPath();
        offCtx.moveTo(turretPoints[0].x, turretPoints[0].y);
        offCtx.lineTo(turretPoints[1].x, turretPoints[1].y);
        offCtx.lineTo(turretPoints[2].x, turretPoints[2].y);
        offCtx.closePath();
        offCtx.fillStyle = explicitColor || "#4CAF50";
        offCtx.fill();

        offCtx.restore();
        return { offCanvas, cx, cy };
    },

    /** Distance from sprite anchor to muzzle tip in unscaled turret units (see `turret()`). */
    turretTipOffset: 4,

    floatingText: (text, style, color) => {
        const measureCanvas = new OffscreenCanvas(1, 1);
        const measureCtx = measureCanvas.getContext("2d");
        measureCtx.font = style.font;
        const metrics = measureCtx.measureText(text);

        const strokeWidth = style.strokeWidth;
        const textWidth = Math.ceil(metrics.width);
        const fontSizeMatch = style.font.match(/(\d+)px/);
        const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 12;
        const textHeight = Math.ceil(fontSize * 1.3);
        const padding = strokeWidth * 2 + 4;
        const W = textWidth + padding;
        const H = textHeight + padding;

        const offCanvas = new OffscreenCanvas(W, H);
        const offCtx = offCanvas.getContext("2d");
        offCtx.textAlign = "center";
        offCtx.textBaseline = "middle";
        offCtx.font = style.font;

        const cx = W / 2;
        const cy = H / 2;

        offCtx.strokeStyle = "rgba(0, 0, 0, 0.95)";
        offCtx.lineWidth = strokeWidth;
        offCtx.lineJoin = "round";
        offCtx.miterLimit = 2;
        offCtx.strokeText(text, cx, cy);

        offCtx.fillStyle = style.getFill(offCtx, color);
        offCtx.fillText(text, cx, cy);

        return { offCanvas, cx, cy };
    },
};
