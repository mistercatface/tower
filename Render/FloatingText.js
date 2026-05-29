export const TextStyles = {
    standard: {
        font: "bold 10px monospace",
        strokeWidth: 1.0,
        scaleFn: (ageRatio) => {
            if (ageRatio < 0.15) {
                return 1.4 - 0.4 * (ageRatio / 0.15);
            }
            return 1.0;
        },
        getFill: (ctx, color) => color
    },
    blast: {
        font: "bold 10px monospace",
        strokeWidth: 1.0,
        scaleFn: (ageRatio) => {
            if (ageRatio < 0.25) {
                const t = ageRatio / 0.25;
                return 1.4 - (1.4 - 1.1) * t;
            }
            return 1.1;
        },
        getFill: (ctx) => {
            const gradient = ctx.createLinearGradient(0, -5, 0, 5);
            gradient.addColorStop(0, "#FFF9C4");
            gradient.addColorStop(0.3, "#FFEB3B");
            gradient.addColorStop(0.65, "#FF5722");
            gradient.addColorStop(1, "#F44336");
            return gradient;
        }
    }
};

export class FloatingText {
    constructor(x, y, text, color, timerId, styleName = "standard") {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.timerId = timerId;
        this.life = 1.0;
        this.isDead = false;
        this.vx = 0;
        this.vy = -20;
        this.gravity = 0;
        this.maxLife = 1000;
        this.style = TextStyles[styleName] || TextStyles.standard;
        this.offCanvas = null;
        this.cx = 0;
        this.cy = 0;
    }

    update(dt, scheduler) {
        const dtSec = dt / 1000;
        this.x += this.vx * dtSec;
        this.y += this.vy * dtSec;
        if (this.gravity) {
            this.vy += this.gravity * dtSec;
        }
        const remaining = scheduler.getTimeRemaining(this.timerId);
        this.life = remaining / this.maxLife;
        if (remaining <= 0) this.isDead = true;
    }

    isVisible(viewport) {
        if (!viewport) return true;
        const radius = Math.max(this.cx, this.cy) || 20;
        return viewport.isVisible(this.x, this.y, radius);
    }

    static spawnBlastDamageText(state, x, y, damage, decimalPlaces = 0) {
        const text = `-${damage.toFixed(decimalPlaces)} BLAST`;
        FloatingText.spawn(state, x, y - 20, text, "#FF5722", "blast", {
            vx: (Math.random() - 0.5) * 80,
            vy: -95 - Math.random() * 40,
            gravity: 200,
            duration: 1200,
        });
    }

    static spawnStandardDamageText(state, x, y, damage) {
        const text = `-${damage.toFixed(1)}`;
        FloatingText.spawn(state, x, y - 20, text, "#F44336", "standard", {
            vx: (Math.random() - 0.5) * 30,
            vy: -40 - Math.random() * 20,
            gravity: 80,
            duration: 900,
        });
    }

    static spawn(state, x, y, text, color, styleName = "standard", options = {}) {
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetY = (Math.random() - 0.5) * 16;
        const duration = options.duration || 1000;
        const timerId = state.scheduler.schedule(duration);
        const ft = new FloatingText(x + offsetX, y + offsetY, text, color, timerId, styleName);
        ft.maxLife = duration;
        ft.vx = options.vx !== undefined ? options.vx : 0;
        ft.vy = options.vy !== undefined ? options.vy : -20;
        ft.gravity = options.gravity !== undefined ? options.gravity : 0;
        state.floatingTexts.push(ft);
    }

    static updateAll(state, dt) {
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = state.floatingTexts[i];
            ft.update(dt, state.scheduler);
            if (ft.isDead) state.floatingTexts.splice(i, 1);
        }
    }

    _initCanvas(ctx) {
        ctx.save();
        ctx.font = this.style.font;
        const metrics = ctx.measureText(this.text);
        ctx.restore();

        const strokeWidth = this.style.strokeWidth;
        const textWidth = Math.ceil(metrics.width);
        
        const fontSizeMatch = this.style.font.match(/(\d+)px/);
        const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 12;
        const textHeight = Math.ceil(fontSize * 1.3);

        const padding = strokeWidth * 2 + 4;
        const W = textWidth + padding;
        const H = textHeight + padding;

        this.offCanvas = new OffscreenCanvas(W, H);
        const offCtx = this.offCanvas.getContext("2d");

        offCtx.textAlign = "center";
        offCtx.textBaseline = "middle";
        offCtx.font = this.style.font;

        const cx = W / 2;
        const cy = H / 2;

        offCtx.strokeStyle = "rgba(0, 0, 0, 0.95)";
        offCtx.lineWidth = strokeWidth;
        offCtx.lineJoin = "round";
        offCtx.miterLimit = 2;
        offCtx.strokeText(this.text, cx, cy);

        offCtx.fillStyle = this.style.getFill(offCtx, this.color);
        offCtx.fillText(this.text, cx, cy);
        
        this.cx = cx;
        this.cy = cy;
    }

    render(ctx, renderer, state) {
        if (!this.offCanvas) {
            this._initCanvas(ctx);
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        
        const ageRatio = 1.0 - this.life;
        let scale = this.style.scaleFn(ageRatio);
        
        if (state && state.viewport) {
            scale /= state.viewport.zoom;
        }
        
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);
        ctx.drawImage(this.offCanvas, -this.cx, -this.cy);
        ctx.restore();
    }
}