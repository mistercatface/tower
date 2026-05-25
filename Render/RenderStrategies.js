export const RenderStrategies = {
    pickup: (ctx, pickup, cache) => {
        const cacheKey = `${pickup.type}_${pickup.radius}`;
        const cachedSprite = cache.get(cacheKey, () => {
            const canvasSize = pickup.radius * 2 + 4;
            const cx = canvasSize / 2;
            const cy = canvasSize / 2;
            const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
            const offCtx = offCanvas.getContext("2d");
            if (pickup.strategy && pickup.strategy.render) pickup.strategy.render(offCtx, cx, cy, pickup.radius);
            return offCanvas;
        });
        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        ctx.restore();
    },
    enemy: (ctx, enemy, cache) => {
        const cacheKey = `${enemy.radius}_${enemy.color}`;
        const cachedSprite = cache.get(cacheKey, () => {
            const canvasSize = Math.ceil(enemy.radius * 2.5) * 2;
            const cx = canvasSize / 2;
            const cy = canvasSize / 2;
            const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
            const offCtx = offCanvas.getContext("2d");
            offCtx.beginPath();
            offCtx.arc(cx, cy, enemy.radius, 0, Math.PI * 2);
            offCtx.fillStyle = enemy.color;
            offCtx.fill();
            return offCanvas;
        });
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
        const cachedSprite = cache.get(cacheKey, () => {
            const canvasSize = Math.ceil(missile.radius * 2);
            const cx = canvasSize / 2;
            const cy = canvasSize / 2;
            const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
            const offCtx = offCanvas.getContext("2d");
            offCtx.beginPath();
            offCtx.arc(cx, cy, missile.radius, 0, Math.PI * 2);
            offCtx.fillStyle = color;
            offCtx.fill();
            return offCanvas;
        });
        ctx.save();
        ctx.translate(missile.x, missile.y);
        ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        ctx.restore();
    },
    planet: (ctx, planet, weaponRange) => {
        if (planet.spawnX !== undefined && planet.spawnY !== undefined && weaponRange > 0) {
            ctx.beginPath();
            ctx.arc(planet.spawnX, planet.spawnY, weaponRange, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(150, 150, 150, 0.5)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([8, 8]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (weaponRange > 0) {
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, weaponRange, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(76, 175, 80, 0.08)";
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
        const cachedSprite = cache.get(cacheKey, () => {
            const margin = Math.max(2, scale);
            const cx = Math.ceil(2 * scale + margin);
            const cy = Math.ceil(2.5 * scale + margin);
            const W = Math.ceil(cx + 4 * scale + margin);
            const H = Math.ceil(cy + 2.5 * scale + margin);
            const offCanvas = new OffscreenCanvas(W, H);
            const offCtx = offCanvas.getContext("2d");
            offCtx.save();
            offCtx.translate(cx, cy);
            offCtx.scale(scale, scale);
            const turretPoints = [
                { x: 4, y: 0 },
                { x: -2, y: 2.5 },
                { x: -2, y: -2.5 },
                { x: 4, y: 0 },
            ];
            offCtx.beginPath();
            offCtx.moveTo(turretPoints[0].x, turretPoints[0].y);
            offCtx.lineTo(turretPoints[1].x, turretPoints[1].y);
            offCtx.lineTo(turretPoints[2].x, turretPoints[2].y);
            offCtx.closePath();
            offCtx.fillStyle = explicitColor || "#4CAF50";
            offCtx.fill();
            if (progress > 0) {
                offCtx.beginPath();
                offCtx.moveTo(turretPoints[0].x, turretPoints[0].y);
                let targetLen = progress * 18;
                for (let i = 0; i < 3; i++) {
                    const p1 = turretPoints[i];
                    const p2 = turretPoints[i + 1];
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const segLen = Math.hypot(dx, dy);
                    if (targetLen >= segLen) {
                        offCtx.lineTo(p2.x, p2.y);
                        targetLen -= segLen;
                    } else {
                        const ratio = targetLen / segLen;
                        offCtx.lineTo(p1.x + dx * ratio, p1.y + dy * ratio);
                        break;
                    }
                }
                offCtx.strokeStyle = strokeColor;
                offCtx.lineWidth = 1;
                offCtx.lineJoin = "round";
                offCtx.stroke();
            }
            offCtx.restore();
            return { offCanvas, cx, cy };
        });
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