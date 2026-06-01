import { normalizeAngle } from "../Math/Angle.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { defaultGunId, getGunDefinition } from "../Config/gunDefinitions.js";
import { defaultTurretLoadout, resolveFireAngleOffsets } from "../Config/turretLoadout.js";
import { Pools } from "../Core/Pools.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { getGunProjectileConfig } from "../Combat/gunCombat.js";
import { inferFaction, areHostile } from "../Combat/Targeting.js";
import { CombatParticles } from "../Render/CombatParticles.js";
import { resolveKinematicsMuzzlePosition, resolvePerspectiveCamera } from "../Render/Kinematics/Kinematics.js";

export class Turret {
    constructor(angle, turnSpeed, loadout = defaultTurretLoadout) {
        this.angle = normalizeAngle(angle);
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

    computeMuzzleDistance(source, projectileRadius, target = null) {
        const defaultDist = source.radius + 12;
        const minDist = source.radius + projectileRadius + 0.5;

        if (!target || !areHostile(source, target)) {
            return defaultDist;
        }

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
            return minDist;
        }

        const aimX = Math.cos(this.angle);
        const aimY = Math.sin(this.angle);
        const dot = (dx / dist) * aimX + (dy / dist) * aimY;
        if (dot < 0.5) {
            return defaultDist;
        }

        const targetRadius = target.radius ?? 8;
        const maxDist = dist - targetRadius + projectileRadius;
        return Math.max(minDist, Math.min(defaultDist, maxDist));
    }

    getMuzzlePosition(source, projectileRadius = 2, target = null) {
        const turretIndex = source.turrets.indexOf(this);
        const camera = source._perspectiveCamera ?? resolvePerspectiveCamera(source, null);
        const muzzle = resolveKinematicsMuzzlePosition(
            source,
            turretIndex >= 0 ? turretIndex : 0,
            camera,
        );
        if (muzzle) return muzzle;

        const dist = this.computeMuzzleDistance(source, projectileRadius, target);
        return {
            x: source.x + Math.cos(this.angle) * dist,
            y: source.y + Math.sin(this.angle) * dist,
        };
    }

    getHudAnchorPosition(source) {
        const gun = getGunDefinition(this.gunId);
        const projectileRadius = gun.bulletRadius * this.loadout.radiusMultiplier;
        const muzzle = this.getMuzzlePosition(source, projectileRadius, this.lastTarget ?? this.target);
        const scale = source.radius / 8;
        const tipOffset = RenderSprites.turretTipOffset * scale;
        return {
            x: muzzle.x - Math.cos(this.angle) * tipOffset,
            y: muzzle.y - Math.sin(this.angle) * tipOffset,
            angle: this.angle,
            scale,
        };
    }

    renderHudTriangle(ctx, renderer, source, color = null) {
        const { x, y, angle, scale } = this.getHudAnchorPosition(source);
        const fillColor = color ?? source.color;
        const cacheKey = `hud_${scale}_${fillColor}`;
        const cachedSprite = renderer.turretCache.get(cacheKey, RenderSprites.turret, scale, fillColor);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.drawImage(cachedSprite.offCanvas, -cachedSprite.cx, -cachedSprite.cy);
        ctx.restore();
    }

    fire(state, source) {
        const gun = getGunDefinition(this.gunId);
        if (gun.kind !== "projectile") return;

        const { radiusMultiplier } = this.loadout;
        const radius = gun.bulletRadius * radiusMultiplier;
        const target = this.lastTarget ?? this.target;
        const { x: tx, y: ty } = this.getMuzzlePosition(source, radius, target);
        const angleOffsets = resolveFireAngleOffsets(this.loadout);
        const faction = inferFaction(source);

        this.spawnProjectiles(state, source, tx, ty, this.angle, gun, radiusMultiplier, angleOffsets, faction);
        CombatParticles.spawnMuzzleFlash(state, tx, ty, this.angle, {
            isPellet: this.loadout.pelletCount != null,
        });
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
            projectile.isPellet = this.loadout.pelletCount != null;
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
}
