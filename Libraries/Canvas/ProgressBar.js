import { clamp } from "../Math/Interpolate.js";
export class ProgressBar {
    constructor(config = {}) {
        this.width = config.width || 20;
        this.height = config.height || 4;
        this.borderRadius = config.borderRadius !== undefined ? config.borderRadius : 2;
        this.quantizationSteps = config.quantizationSteps || 20;
        this.bgColor = config.bgColor || "rgba(21, 21, 28, 0.75)";
        this.borderColor = config.borderColor || "rgba(255, 255, 255, 0.15)";
        this.colorFn =
            config.colorFn ||
            ((ratio) => {
                if (ratio > 0.5) return "#00E676";
                if (ratio > 0.2) return "#FFEB3B";
                return "#FF1744";
            });
    }
    render(ctx, x, y, ratio, cache = null) {
        const clampedRatio = clamp(ratio, 0, 1);
        const quantizedRatio = Math.round(clampedRatio * this.quantizationSteps) / this.quantizationSteps;
        if (!cache) {
            // Draw un-cached fallback if no sprite cache is provided
            const fillW = Math.max(0, Math.round(this.width * quantizedRatio));
            ctx.save();
            ctx.translate(x - this.width / 2, y - this.height / 2);
            ctx.fillStyle = this.bgColor;
            ctx.strokeStyle = this.borderColor;
            ctx.lineWidth = 1;
            this._drawRoundRect(ctx, 0, 0, this.width, this.height, this.borderRadius);
            ctx.fill();
            ctx.stroke();
            if (quantizedRatio > 0) {
                ctx.fillStyle = this.colorFn(quantizedRatio);
                ctx.beginPath();
                this._drawRoundRect(ctx, 0, 0, this.width, this.height, this.borderRadius);
                ctx.clip();
                ctx.beginPath();
                ctx.rect(0, 0, fillW, this.height);
                ctx.fill();
            }
            ctx.restore();
            return;
        }
        const cacheKey = `pb_${this.width}_${this.height}_${quantizedRatio.toFixed(2)}`;
        const cachedSprite = cache.get(cacheKey, () => {
            const canvasSizeW = this.width + 2;
            const canvasSizeH = this.height + 2;
            const offCanvas = new OffscreenCanvas(canvasSizeW, canvasSizeH);
            const offCtx = offCanvas.getContext("2d");
            offCtx.fillStyle = this.bgColor;
            offCtx.strokeStyle = this.borderColor;
            offCtx.lineWidth = 1;
            this._drawRoundRect(offCtx, 1, 1, this.width, this.height, this.borderRadius);
            offCtx.fill();
            offCtx.stroke();
            if (quantizedRatio > 0) {
                const fillW = Math.max(1, Math.round(this.width * quantizedRatio));
                offCtx.fillStyle = this.colorFn(quantizedRatio);
                offCtx.save();
                offCtx.beginPath();
                this._drawRoundRect(offCtx, 1, 1, this.width, this.height, this.borderRadius);
                offCtx.clip();
                offCtx.beginPath();
                offCtx.rect(1, 1, fillW, this.height);
                offCtx.fill();
                offCtx.restore();
            }
            return offCanvas;
        });
        ctx.save();
        ctx.translate(x, y);
        ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        ctx.restore();
    }
    _drawRoundRect(ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
}
