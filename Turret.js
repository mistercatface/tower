import { Utilities } from "./Utilities.js";
import { RenderSprites } from "./Render/RenderSprites.js";

export class Turret {
    constructor(angle, turnSpeed) {
        this.angle = Utilities.normalizeAngle(angle);
        this.turnSpeed = turnSpeed;
        this.charge = 0;
        this.target = null;
    }

    render(ctx, playerX, playerY, playerRadius, renderer, explicitColor = null) {
        const turretDist = playerRadius + 4;
        const tx = playerX + Math.cos(this.angle) * turretDist;
        const ty = playerY + Math.sin(this.angle) * turretDist;

        const scale = playerRadius / 8;
        const cacheKey = `${scale}_${explicitColor || "#4CAF50"}`;
        const cachedSprite = renderer.turretCache.get(cacheKey, RenderSprites.turret, scale, explicitColor);

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(this.angle);
        ctx.drawImage(cachedSprite.offCanvas, -cachedSprite.cx, -cachedSprite.cy);
        ctx.restore();
    }
}