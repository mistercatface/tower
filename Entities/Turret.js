import { Utilities } from "../Core/Utilities.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { enemyProjectileSettings, playerProjectileSettings } from "../Config/Config.js";
import { defaultGunId, getGunDefinition } from "../Config/gunDefinitions.js";
import { defaultTurretLoadout, resolveFireAngleOffsets } from "../Config/turretLoadoutPresets.js";
import { Pools } from "../Core/Pools.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";

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

        if (source.type === "player") {
            const { radiusMultiplier } = this.loadout;
            const angleOffsets = resolveFireAngleOffsets(this.loadout);
            this.spawnProjectiles(state, source, tx, ty, this.angle, gun, radiusMultiplier, angleOffsets, "player");
            return;
        }

        const projectile = Pools.projectiles.acquire(
            tx,
            ty,
            gun.bulletRadius,
            gun.muzzleSpeed,
            null,
            this.angle,
            gun.damage,
            "enemy"
        );
        projectile.penetration = source.weapon.penetration;
        state.projectiles.push(projectile);
        PhysicsSystem.applyKnockback(
            source,
            this.angle + Math.PI,
            projectile.radius * enemyProjectileSettings.knockbackMultiplier
        );
    }

    spawnProjectiles(state, source, tx, ty, baseAngle, gun, radiusMultiplier, angleOffsets, faction) {
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
            projectile.penetration = source.weapon.penetration;
            projectiles.push(projectile);
        }

        state.projectiles.push(...projectiles);

        if (projectiles.length > 0) {
            const knockbackScale = projectiles.reduce((sum, p) => sum + p.radius, 0);
            PhysicsSystem.applyKnockback(
                source,
                baseAngle + Math.PI,
                knockbackScale * playerProjectileSettings.knockbackMultiplier
            );
        }
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
