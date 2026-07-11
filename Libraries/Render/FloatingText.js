import { SpriteCache } from "../Canvas/canvas.js";
import { RenderSprites } from "../../Render/RenderSprites.js";
import { events } from "../../Core/EventSystem.js";
const floatingTextCache = new SpriteCache();
export const FLOATING_TEXT_SPAWN_EVENT = "fx:floatingText";
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
    static handleSpawnEvent({ state, variant = "custom", x, y, text, color, style, options }) {
        if (!state.floatingTexts) return;
        if (variant !== "custom") return;
        FloatingText.spawn(state, x, y, text, color, style ?? "standard", options ?? {});
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
events.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
