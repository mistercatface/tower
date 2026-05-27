import { Utilities } from "./Utilities.js";
import { RenderSprites } from "./Render/RenderSprites.js";

export class Turret {
    constructor(angle, turnSpeed) {
        this.angle = Utilities.normalizeAngle(angle);
        this.turnSpeed = turnSpeed;
        this.charge = 0;
        this.target = null;
    }

    render(ctx, planetX, planetY, planetRadius, renderer, explicitColor = null) {
        const turretDist = planetRadius + 4;
        const tx = planetX + Math.cos(this.angle) * turretDist;
        const ty = planetY + Math.sin(this.angle) * turretDist;

        const scale = planetRadius / 8;
        const cacheKey = `${scale}_${explicitColor || "#4CAF50"}`;
        const cachedSprite = renderer.turretCache.get(cacheKey, RenderSprites.turret, scale, explicitColor);

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(this.angle);
        ctx.drawImage(cachedSprite.offCanvas, -cachedSprite.cx, -cachedSprite.cy);
        ctx.restore();
    }
}