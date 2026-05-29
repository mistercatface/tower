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

    player: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2) + 4;
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

    wall: (size, r, g, b) => {
        const offCanvas = new OffscreenCanvas(size + 2, size + 2);
        const offCtx = offCanvas.getContext("2d");
        offCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        offCtx.fillRect(1, 1, size, size);
        return offCanvas;
    },

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

    reloadRing: (scale, activeSegments, segments = 5) => {
        const ringRadius = scale * 5.5;
        const padding = 2 + scale * 2;
        const size = Math.ceil((ringRadius + padding) * 2);
        const cx = size / 2;
        const cy = size / 2;

        const offCanvas = new OffscreenCanvas(size, size);
        const offCtx = offCanvas.getContext("2d");

        offCtx.save();
        offCtx.translate(cx, cy);
        for (let i = 0; i < segments; i++) {
            const angleStart = (i * 2 * Math.PI) / segments;
            const angleEnd = ((i + 1) * 2 * Math.PI) / segments - 0.2;
            offCtx.beginPath();
            offCtx.arc(0, 0, ringRadius, angleStart, angleEnd);
            offCtx.lineWidth = scale * 0.8;
            offCtx.strokeStyle = i < activeSegments ? "#FFC107" : "rgba(255, 255, 255, 0.15)";
            offCtx.stroke();
        }
        offCtx.restore();
        return { offCanvas, cx, cy };
    },

    cooldownArc: (scale, step, steps = 10) => {
        const f = 1.45;
        const maxDist = 4 * scale * f;
        const padding = 2 + scale * 2;
        const size = Math.ceil((maxDist + padding) * 2);
        const cx = size / 2;
        const cy = size / 2;

        const offCanvas = new OffscreenCanvas(size, size);
        const offCtx = offCanvas.getContext("2d");

        offCtx.save();
        offCtx.translate(cx, cy);

        const ratio = step / steps;
        
        const p0 = { x: 4 * scale * f, y: 0 };
        const p1 = { x: -2 * scale * f, y: 2.5 * scale * f };
        const p2 = { x: -2 * scale * f, y: -2.5 * scale * f };

        const points = [p0, p1, p2, p0];
        const lengths = [9.1 * scale, 7.0 * scale, 9.1 * scale];
        const totalLength = 25.2 * scale;

        let targetLength = totalLength * ratio;

        offCtx.beginPath();
        offCtx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < 3; i++) {
            const pStart = points[i];
            const pEnd = points[i + 1];
            const len = lengths[i];
            
            if (targetLength >= len) {
                offCtx.lineTo(pEnd.x, pEnd.y);
                targetLength -= len;
            } else {
                const segmentRatio = targetLength / len;
                const x = pStart.x + (pEnd.x - pStart.x) * segmentRatio;
                const y = pStart.y + (pEnd.y - pStart.y) * segmentRatio;
                offCtx.lineTo(x, y);
                break;
            }
        }

        offCtx.strokeStyle = "#FF5722";
        offCtx.lineWidth = Math.max(1.8, scale * 1.8);
        offCtx.lineJoin = "round";
        offCtx.stroke();
        
        offCtx.restore();
        return { offCanvas, cx, cy };
    },
};
