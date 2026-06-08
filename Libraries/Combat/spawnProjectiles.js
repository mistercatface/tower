import { applyKnockback } from "../Motion/index.js";
import { getGunProjectileConfig } from "./gunCombat.js";
import { Projectile } from "../../Entities/Projectile.js";
/**
 * Spawns projectiles for a given gun and loadout.
 * @param {object} state The game state
 * @param {object} source The actor/pickup firing
 * @param {{ tx: number, ty: number, baseAngle: number, gun: object, radiusMultiplier: number, angleOffsets: number[], faction: string, penetration?: number }} params
 */
export function spawnProjectilesFromGun(state, source, { tx, ty, baseAngle, gun, radiusMultiplier, angleOffsets, faction, penetration = 0 }) {
    const projectileConfig = getGunProjectileConfig(gun);
    const projectiles = [];
    const radius = gun.bulletRadius * radiusMultiplier;
    for (const offset of angleOffsets) {
        const pool = state.projectilePool;
        const projectile = pool
            ? pool.acquire(tx, ty, radius, gun.muzzleSpeed, null, baseAngle + offset, gun.damage, faction)
            : (() => {
                  const p = new Projectile();
                  p.reset(tx, ty, radius, gun.muzzleSpeed, null, baseAngle + offset, gun.damage, faction);
                  return p;
              })();
        projectile.gunId = gun.id;
        projectile.penetration = penetration;
        projectile.isPellet = angleOffsets.length > 1; // Simplification for pellet check
        projectiles.push(projectile);
    }
    state.projectiles.push(...projectiles);
    if (projectiles.length > 0) {
        const knockbackScale = projectiles.reduce((sum, p) => sum + p.radius, 0);
        applyKnockback(source, baseAngle + Math.PI, knockbackScale * (projectileConfig.shooterKnockbackMultiplier ?? 0));
    }
}
