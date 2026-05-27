import { Utilities } from "./Utilities.js";
import { RenderSprites } from "./Render/RenderSprites.js";

export class Turret {
    constructor(angle, turnSpeed) {
        this.angle = Utilities.normalizeAngle(angle);
        this.turnSpeed = turnSpeed;
        this.charge = 0;
        this.target = null;
    }

    render(ctx, planetX, planetY, planetRadius, weaponCharge, weaponChargeTime, cache, explicitColor = null) {
        const turretDist = planetRadius + 4;
        const tx = planetX + Math.cos(this.angle) * turretDist;
        const ty = planetY + Math.sin(this.angle) * turretDist;

        const scale = planetRadius / 8;
        let progress = 1;
        let strokeColor = explicitColor || "#4CAF50";
        if (weaponCharge > 0) {
            progress = weaponCharge / weaponChargeTime;
            strokeColor = "#ff0000";
        }

        const progressKey = progress.toFixed(2);
        const cacheKey = `${scale}_${explicitColor || "#4CAF50"}_${progressKey}_${strokeColor}`;
        const cachedSprite = cache.get(cacheKey, RenderSprites.turret, scale, explicitColor, progress, strokeColor);

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(this.angle);
        ctx.drawImage(cachedSprite.offCanvas, -cachedSprite.cx, -cachedSprite.cy);
        ctx.restore();
    }
}