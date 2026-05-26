import { RenderSprites } from "./RenderSprites.js";

export const RenderStrategies = {
    pickup: (ctx, pickup, cache) => {
        const cacheKey = `${pickup.type}_${pickup.radius}`;
        const cachedSprite = cache.get(cacheKey, RenderSprites.pickup, pickup.type, pickup.radius, pickup.strategy);
        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        ctx.restore();
    },
    enemy: (ctx, enemy, cache) => {
        const cacheKey = `${enemy.radius}_${enemy.color}`;
        const cachedSprite = cache.get(cacheKey, RenderSprites.enemy, enemy.radius, enemy.color);
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(enemy.angle);
        ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        ctx.restore();
        if (enemy.health < enemy.maxHealth) {
            ctx.fillStyle = "#FFF";
            const currentHealth = Math.max(0, enemy.health);
            ctx.fillRect(enemy.x - 10, enemy.y - 12, 20 * (currentHealth / enemy.maxHealth), 3);
        }
    },
    missile: (ctx, missile, color, cache) => {
        const cacheKey = `${missile.radius}_${color}`;
        const cachedSprite = cache.get(cacheKey, RenderSprites.missile, missile.radius, color);
        ctx.save();
        ctx.translate(missile.x, missile.y);
        ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        ctx.restore();
    },
    planet: (ctx, planet, weaponRange) => {
        if (weaponRange > 0) {
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, weaponRange, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(76, 255, 80, 0.16)";
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#4CAF50";
        ctx.fill();
    },
    turret: (ctx, turret, planetX, planetY, planetRadius, weaponCharge, weaponChargeTime, cache, explicitColor = null) => {
        const turretDist = planetRadius + 4;
        const tx = planetX + Math.cos(turret.angle) * turretDist;
        const ty = planetY + Math.sin(turret.angle) * turretDist;

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
        ctx.rotate(turret.angle);
        ctx.drawImage(cachedSprite.offCanvas, -cachedSprite.cx, -cachedSprite.cy);
        ctx.restore();
    },
    floatingText: (ctx, ft) => {
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.fillStyle = ft.color;
        ctx.font = "12px monospace";
        ctx.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
        ctx.globalAlpha = 1.0;
    },
    targetMarker: (ctx, x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = "#4CAF50";
        ctx.lineWidth = 2;
        const size = 6;
        ctx.beginPath();
        ctx.moveTo(-size, -size);
        ctx.lineTo(size, size);
        ctx.moveTo(size, -size);
        ctx.lineTo(-size, size);
        ctx.stroke();
        ctx.restore();
    },
    laser: (ctx, laser) => {
        ctx.beginPath();
        ctx.moveTo(laser.x1, laser.y1);
        ctx.lineTo(laser.x2, laser.y2);
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.stroke();
    },
};