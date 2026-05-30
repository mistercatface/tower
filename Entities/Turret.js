import { Utilities } from "../Core/Utilities.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { defaultGunId, getGunDefinition } from "../Config/gunDefinitions.js";
import { defaultTurretLoadout, resolveFireAngleOffsets } from "../Config/turretLoadoutPresets.js";
import { Pools } from "../Core/Pools.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { getGunProjectileConfig, getSlotFireIntervalMs } from "../Combat/gunCombat.js";
import { inferFaction } from "../Combat/Targeting.js";

export class Turret {
    constructor(angle, turnSpeed, loadout = defaultTurretLoadout) {
        this.angle = Utilities.normalizeAngle(angle);
        this.turnSpeed = turnSpeed;
        this.loadout = {
            radiusMultiplier: loadout.radiusMultiplier,
            ...(loadout.angleOffsets ? { angleOffsets: [...loadout.angleOffsets] } : {}),
            ...(loadout.pelletCount != null ? { pelletCount: loadout.pelletCount } : {}),
            ...(loadout.spreadRadians != null ? { spreadRadians: loadout.spreadRadians } : {}),
        };
        this.gunId = defaultGunId;
        this.charge = 0;
        this.target = null;
        this.swayPhase = 0;
    }

    getMuzzlePosition(source) {
        const turretDist = source.radius + 12;
        return {
            x: source.x + Math.cos(this.angle) * turretDist,
            y: source.y + Math.sin(this.angle) * turretDist,
        };
    }

    fire(state, source) {
        const gun = getGunDefinition(this.gunId);
        if (gun.kind !== "projectile") return;

        const { x: tx, y: ty } = this.getMuzzlePosition(source);
        const { radiusMultiplier } = this.loadout;
        const angleOffsets = resolveFireAngleOffsets(this.loadout);
        const faction = inferFaction(source);

        this.spawnProjectiles(state, source, tx, ty, this.angle, gun, radiusMultiplier, angleOffsets, faction);
    }

    spawnProjectiles(state, source, tx, ty, baseAngle, gun, radiusMultiplier, angleOffsets, faction) {
        const projectileConfig = getGunProjectileConfig(gun);
        const projectiles = [];
        const radius = gun.bulletRadius * radiusMultiplier;

        for (const offset of angleOffsets) {
            const projectile = Pools.projectiles.acquire(
                tx,
                ty,
                radius,
                gun.muzzleSpeed,
                null,
                baseAngle + offset,
                gun.damage,
                faction
            );
            projectile.gunId = gun.id;
            projectile.penetration = source.weapon.penetration;
            projectiles.push(projectile);
        }

        state.projectiles.push(...projectiles);

        if (projectiles.length > 0) {
            const knockbackScale = projectiles.reduce((sum, p) => sum + p.radius, 0);
            PhysicsSystem.applyKnockback(
                source,
                baseAngle + Math.PI,
                knockbackScale * projectileConfig.shooterKnockbackMultiplier
            );
        }
    }

    render(ctx, playerX, playerY, playerRadius, renderer, explicitColor = null, source = null) {
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

        // Render reload ring or cooldown/ready indicator using SpriteCache
        if (this.reloading && this.reloadTimer !== undefined) {
            const gun = getGunDefinition(this.gunId);
            if (gun.reloadTimeMs > 0) {
                const progress = Math.min(1, this.reloadTimer / gun.reloadTimeMs);
                const activeSegments = Math.min(5, Math.floor(progress * 5));
                const cacheKeyRing = `rr_${scale}_${activeSegments}`;
                const cachedRing = renderer.turretCache.get(cacheKeyRing, RenderSprites.reloadRing, scale, activeSegments);
                ctx.drawImage(cachedRing.offCanvas, -cachedRing.cx, -cachedRing.cy);
            }
        } else {
            const gun = getGunDefinition(this.gunId);
            const fireIntervalMs = source ? getSlotFireIntervalMs(gun, source) : gun.fireIntervalMs;
            if (fireIntervalMs > 0 && !isNaN(fireIntervalMs) && this.charge !== undefined) {
                const chargeRatio = Math.min(1, this.charge / fireIntervalMs);
                if (chargeRatio < 1 && this.lastTarget) {
                    const step = Math.min(10, Math.floor(chargeRatio * 10));
                    const cacheKeyArc = `ca_${scale}_${step}`;
                    const cachedArc = renderer.turretCache.get(cacheKeyArc, RenderSprites.cooldownArc, scale, step);
                    ctx.drawImage(cachedArc.offCanvas, -cachedArc.cx, -cachedArc.cy);
                } else {
                    // Ready dot (small green light) at the back of the turret housing
                    ctx.beginPath();
                    ctx.arc(-scale * 2.2, 0, scale * 0.6, 0, Math.PI * 2);
                    ctx.fillStyle = "#00E676";
                    ctx.fill();
                }
            }
        }

        ctx.restore();
    }
}
