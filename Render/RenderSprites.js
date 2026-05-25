export const RenderSprites = {
    pickup: (pickupType, radius, strategy) => {
        const canvasSize = radius * 2 + 4;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");
        if (strategy && strategy.render) strategy.render(offCtx, cx, cy, radius);
        return offCanvas;
    },

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

    missile: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2);
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

    turret: (scale, explicitColor, progress, strokeColor) => {
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

        if (progress > 0) {
            offCtx.beginPath();
            offCtx.moveTo(turretPoints[0].x, turretPoints[0].y);
            let targetLen = progress * 18;
            for (let i = 0; i < 3; i++) {
                const p1 = turretPoints[i];
                const p2 = turretPoints[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const segLen = Math.hypot(dx, dy);
                if (targetLen >= segLen) {
                    offCtx.lineTo(p2.x, p2.y);
                    targetLen -= segLen;
                } else {
                    const ratio = targetLen / segLen;
                    offCtx.lineTo(p1.x + dx * ratio, p1.y + dy * ratio);
                    break;
                }
            }
            offCtx.strokeStyle = strokeColor;
            offCtx.lineWidth = 1;
            offCtx.lineJoin = "round";
            offCtx.stroke();
        }

        offCtx.restore();
        return { offCanvas, cx, cy };
    },

    wall: (size, r, g, b) => {
        const offCanvas = new OffscreenCanvas(size + 2, size + 2);
        const offCtx = offCanvas.getContext("2d");
        offCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        offCtx.fillRect(1, 1, size, size);
        return offCanvas;
    }
};
