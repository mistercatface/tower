import { RenderSprites } from "../../Render/RenderSprites.js";
import { SpriteCache } from "../Canvas/SpriteCache.js";
const floatingTextCache = new SpriteCache();
export const TextStyles = {
    standard: {
        font: "bold 10px monospace",
        strokeWidth: 1.0,
        scaleFn: (ageRatio) => {
            if (ageRatio < 0.15) return 1.4 - 0.4 * (ageRatio / 0.15);
            return 1.0;
        },
        getFill: (ctx, color) => color,
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
        },
    },
};
export class FloatingText {
    constructor(x, y, text, color, timerId, styleName = "standard") {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.timerId = timerId;
        this.styleName = styleName;
        this.life = 1.0;
        this.isDead = false;
        this.vx = 0;
        this.vy = -20;
        this.gravity = 0;
        this.maxLife = 1000;
        this.style = TextStyles[styleName] || TextStyles.standard;
    }
    getCacheKey() {
        return `${this.styleName}_${this.color}_${this.text}`;
    }
    update(dt, scheduler) {
        const dtSec = dt / 1000;
        this.x += this.vx * dtSec;
        this.y += this.vy * dtSec;
        if (this.gravity) this.vy += this.gravity * dtSec;
        const remaining = scheduler.getTimeRemaining(this.timerId);
        this.life = remaining / this.maxLife;
        if (remaining <= 0) this.isDead = true;
    }
    isVisible(viewport) {
        if (!viewport) return true;
        return viewport.isVisible(this.x, this.y, 20);
    }
    static spawnBlastDamageText(state, x, y, damage) {
        const text = `-${Math.round(damage)} BLAST`;
        FloatingText.spawn(state, x, y - 20, text, "#FF5722", "blast", { vx: (Math.random() - 0.5) * 80, vy: -95 - Math.random() * 40, gravity: 200, duration: 1200 });
    }
    static spawnStandardDamageText(state, x, y, damage) {
        const text = `-${Math.round(damage)}`;
        FloatingText.spawn(state, x, y - 20, text, "#F44336", "standard", { vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 20, gravity: 80, duration: 900 });
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
        if (!state.floatingTexts) return;
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = state.floatingTexts[i];
            ft.update(dt, state.scheduler);
            if (ft.isDead) state.floatingTexts.splice(i, 1);
        }
    }
    static handleSpawnEvent({ state, variant = "custom", x, y, text, color, style, options, damage }) {
        if (!state.floatingTexts) return;
        switch (variant) {
            case "blastDamage":
                FloatingText.spawnBlastDamageText(state, x, y, damage);
                break;
            case "standardDamage":
                FloatingText.spawnStandardDamageText(state, x, y, damage);
                break;
            default:
                FloatingText.spawn(state, x, y, text, color, style ?? "standard", options ?? {});
                break;
        }
    }
    render(ctx, renderer, state) {
        const cacheKey = this.getCacheKey();
        const sprite = floatingTextCache.get(cacheKey, RenderSprites.floatingText, this.text, this.style, this.color);
        const img = sprite.offCanvas || sprite;
        const cx = sprite.cx !== undefined ? sprite.cx : img.width / 2;
        const cy = sprite.cy !== undefined ? sprite.cy : img.height / 2;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        const ageRatio = 1.0 - this.life;
        let scale = this.style.scaleFn(ageRatio);
        if (state && state.viewport) scale /= state.viewport.zoom;
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);
        ctx.drawImage(img, -cx, -cy);
        ctx.restore();
    }
}
