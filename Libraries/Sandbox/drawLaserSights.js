import { getActiveSightAttachment } from "../Combat/gunModifiers.js";
import { buildLaserTargetCircles, castLaserRay } from "../Combat/laserCast.js";
import { DEFAULT_SIGHT_RANGE, resolvePickupSlotGun } from "../Combat/pickupWeaponState.js";
import { forEachArmedSandboxPickup } from "./sandboxCapabilities.js";
import { resolveKinematicsMuzzlePosition } from "../Render/Characters/actorKinematicsRenderer.js";
import { drawLaserBeam } from "../Render/LaserBeam.js";
function resolveSightColor(hit, source) {
    if (hit.hit === "actor" && hit.entity !== source) return "#ff0000";
    return "#00ff00";
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./SandboxHostPort.js").SandboxHostPort & { getWorldState?: () => object }} host
 */
export function drawSandboxLaserSights(ctx, host) {
    const worldState = host.getWorldState?.();
    if (!worldState) return;
    const camera = host.getCameraOrigin?.() ?? { x: 0, y: 0 };
    forEachArmedSandboxPickup(host, (pickup) => {
        const loadout = pickup.weaponLoadout;
        for (let slotIndex = 0; slotIndex < loadout.length; slotIndex++) {
            const gun = resolvePickupSlotGun(pickup, slotIndex);
            if (!getActiveSightAttachment(gun)) continue;
            let muzzle = resolveKinematicsMuzzlePosition(pickup, slotIndex, camera);
            const angle = pickup.turrets?.[slotIndex]?.angle ?? pickup.facing ?? pickup.angle ?? 0;
            const circles = buildLaserTargetCircles(worldState, { source: pickup, includePickups: true, includeActors: [] });
            const hit = castLaserRay(muzzle.x, muzzle.y, angle, DEFAULT_SIGHT_RANGE, worldState, 1, circles);
            drawLaserBeam(ctx, muzzle.x, muzzle.y, hit.x, hit.y, resolveSightColor(hit, pickup), true);
        }
    });
}
