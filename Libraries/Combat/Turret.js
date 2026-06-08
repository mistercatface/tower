import { normalizeAngle } from "../Math/Angle.js";
import { defaultGunId, getGunDefinition } from "./gunDefaults.js";
import { applyKnockback } from "../Motion/index.js";
import { getGunProjectileConfig } from "./gunCombat.js";
import { inferFaction, areHostile } from "../../Core/GamePorts.js";
import { CombatParticles } from "../Render/CombatParticles.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { resolveKinematicsMuzzlePosition, resolveActorKinematicsCamera } from "../Render/Characters/actorKinematicsRenderer.js";
import { Projectile } from "../../Entities/Projectile.js";
import { spawnProjectilesFromGun } from "./spawnProjectiles.js";
import { defaultTurretLoadout, resolveFireAngleOffsets } from "./turretLoadout.js";
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
        this.gun = null;
        this.charge = 0;
        this.target = null;
        this.swayPhase = 0;
    }
    computeMuzzleDistance(source, projectileRadius, target = null) {
        const defaultDist = source.radius + 12;
        const minDist = source.radius + projectileRadius + 0.5;
        if (!target || !areHostile(source, target)) return defaultDist;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) return minDist;
        const aimX = Math.cos(this.angle);
        const aimY = Math.sin(this.angle);
        const dot = (dx / dist) * aimX + (dy / dist) * aimY;
        if (dot < 0.5) return defaultDist;
        const targetRadius = resolveBodyRadius(target);
        const maxDist = dist - targetRadius + projectileRadius;
        return Math.max(minDist, Math.min(defaultDist, maxDist));
    }
    getMuzzlePosition(source, projectileRadius = 2, target = null) {
        const sourceTurrets = source.getTurrets ? source.getTurrets() : source.turrets || [];
        const turretIndex = sourceTurrets.indexOf(this);
        const camera = resolveActorKinematicsCamera(source);
        const muzzle = resolveKinematicsMuzzlePosition(source, turretIndex >= 0 ? turretIndex : 0, camera);
        if (muzzle) return muzzle;
        const dist = this.computeMuzzleDistance(source, projectileRadius, target);
        return { x: source.x + Math.cos(this.angle) * dist, y: source.y + Math.sin(this.angle) * dist };
    }
    fire(state, source) {
        const gun = this.gun ?? getGunDefinition(this.gunId);
        if (gun.kind !== "projectile") return;
        const loadout = this.loadout || defaultTurretLoadout;
        const { radiusMultiplier } = loadout;
        const radius = gun.bulletRadius * radiusMultiplier;
        const target = this.lastTarget ?? this.target;
        const { x: tx, y: ty } = this.getMuzzlePosition(source, radius, target);
        const angleOffsets = resolveFireAngleOffsets(loadout);
        const faction = inferFaction(source);
        spawnProjectilesFromGun(state, source, { tx, ty, baseAngle: this.angle, gun, radiusMultiplier, angleOffsets, faction, penetration: source.weapon?.penetration ?? 0 });
        CombatParticles.spawnMuzzleFlash(state, tx, ty, this.angle, { isPellet: loadout.pelletCount != null });
    }
}
