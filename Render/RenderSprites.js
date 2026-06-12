import { createOffscreenCanvas } from "../Libraries/Canvas/offscreenCanvas.js";
export const RenderSprites = {
    floatingText: (text, style, color) => {
        const measureCtx = createOffscreenCanvas(1, 1).getContext("2d");
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
        const offCanvas = createOffscreenCanvas(W, H);
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
