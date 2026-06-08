import { syncPickupWeaponState } from "./pickupWeaponState.js";
import { spawnProjectilesFromGun } from "./spawnProjectiles.js";
import { resolveFireAngleOffsets } from "./turretLoadout.js";
import { resolveKinematicsMuzzlePosition } from "../Render/Characters/actorKinematicsRenderer.js";
import { CombatParticles } from "../Render/CombatParticles.js";
import { inferFaction } from "../../Core/GamePorts.js";
import { getSlotFireIntervalMs } from "./gunCombat.js";
/** Handle manual fire for pickups without full Turret AI controllers. */
export function manualFirePickup(state, pickup, targetX, targetY, dt) {
    syncPickupWeaponState(pickup);
    const camera = { x: 0, y: 0 }; // or pickup.x, pickup.y
    let firedAny = false;
    const angle = Math.atan2(targetY - pickup.y, targetX - pickup.x);
    pickup.facing = angle;
    for (let i = 0; i < pickup.turrets.length; i++) {
        const turret = pickup.turrets[i];
        if (!turret || !turret.gun) continue;
        const gun = turret.gun;
        turret.angle = angle;
        if (turret.manualFireCooldown === undefined) turret.manualFireCooldown = 0;
        if (turret.manualFireCooldown > 0) {
            turret.manualFireCooldown -= dt;
            continue;
        }
        if (gun.kind === "projectile") {
            const muzzle = resolveKinematicsMuzzlePosition(pickup, i, camera);
            if (!muzzle) continue;
            const radiusMultiplier = gun.turretLoadout?.radiusMultiplier ?? 1;
            const angleOffsets = resolveFireAngleOffsets(gun.turretLoadout);
            const faction = inferFaction(pickup) ?? "player";
            spawnProjectilesFromGun(state, pickup, { tx: muzzle.x, ty: muzzle.y, baseAngle: turret.angle, gun, radiusMultiplier, angleOffsets, faction });
            CombatParticles.spawnMuzzleFlash(state, muzzle.x, muzzle.y, turret.angle, { isPellet: angleOffsets.length > 1 });
            firedAny = true;
            turret.manualFireCooldown = getSlotFireIntervalMs(gun, pickup);
        }
    }
    return firedAny;
}
