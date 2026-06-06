import { RenderSprites } from "./RenderSprites.js";
export class ActorRenderer {
    constructor(actor) {
        this.actor = actor;
    }
    renderCombatHudClassic(ctx, renderer) {
        this.actor.renderCachedSprite(
            ctx,
            this.actor.getSpriteCache(renderer),
            `hud_${this.actor.type}_${this.actor.radius}_${this.actor.color}`,
            RenderSprites.enemy,
            this.actor.radius,
            this.actor.color,
        );
        for (const turret of this.actor.getTurrets()) turret.renderHudTriangle(ctx, renderer, this.actor);
    }
    renderStatusBars(ctx, renderer, state) {
        this.renderBars(ctx, this.actor.getSpriteCache(renderer), this.actor.getStatusBarYOffset());
    }
    renderBars(ctx, cache, yOffset) {
        if (this.actor.health < this.actor.maxHealth && this.actor.healthBar) {
            const currentHealth = Math.max(0, this.actor.health);
            this.actor.healthBar.render(ctx, this.actor.x, this.actor.y - yOffset, currentHealth / this.actor.maxHealth, cache);
        }
        let secondaryOffset = yOffset;
        if (this.actor.health < this.actor.maxHealth && this.actor.healthBar) secondaryOffset += this.actor.healthBar.height + 4;
        const stunRatio = this.actor.getStunBarProgress();
        if (stunRatio != null && this.actor.stunBar) this.actor.stunBar.render(ctx, this.actor.x, this.actor.y - secondaryOffset, stunRatio, cache);
        else {
            const reloadRatio = this.actor.getReloadBarProgress();
            if (reloadRatio != null && this.actor.reloadBar) this.actor.reloadBar.render(ctx, this.actor.x, this.actor.y - secondaryOffset, reloadRatio, cache);
        }
    }
}
