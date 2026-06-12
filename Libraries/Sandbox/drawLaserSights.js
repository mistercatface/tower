import { getActiveSightAttachment } from "../Combat/gunModifiers.js";
import { buildLaserTargetCircles, castLaserRay } from "../Combat/laserCast.js";
import { DEFAULT_SIGHT_RANGE, resolveWorldPropSlotGun } from "../Combat/worldPropWeaponState.js";
import { forEachArmedSandboxWorldProp } from "./sandboxCapabilities.js";
import { resolveKinematicsMuzzlePosition } from "../Render/Characters/actorKinematicsRenderer.js";
import { drawLaserBeam } from "../Render/LaserBeam.js";
function resolveSightColor(hit, source) {
    if (hit.hit === "actor" && hit.entity !== source) return "#ff0000";
    return "#00ff00";
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 */
export function drawSandboxLaserSights(ctx, host) {
    const worldState = host.getSimState?.();
    if (!worldState) return;
    const camera = host.getCameraOrigin?.() ?? { x: 0, y: 0 };
    forEachArmedSandboxWorldProp(host, (prop) => {
        const loadout = prop.weaponLoadout;
        for (let slotIndex = 0; slotIndex < loadout.length; slotIndex++) {
            const gun = resolveWorldPropSlotGun(prop, slotIndex);
            if (!getActiveSightAttachment(gun)) continue;
            let muzzle = resolveKinematicsMuzzlePosition(prop, slotIndex, camera);
            const angle = prop.turrets?.[slotIndex]?.angle ?? prop.facing ?? prop.angle ?? 0;
            const circles = buildLaserTargetCircles(worldState, { source: prop });
            const hit = castLaserRay(muzzle.x, muzzle.y, angle, DEFAULT_SIGHT_RANGE, worldState, 1, circles);
            drawLaserBeam(ctx, muzzle.x, muzzle.y, hit.x, hit.y, resolveSightColor(hit, prop), true);
        }
    });
}
