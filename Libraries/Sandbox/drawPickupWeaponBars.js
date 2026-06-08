import { ProgressBar } from "../../Libraries/Canvas/ProgressBar.js";
import { getSlotFireIntervalMs, getSlotReloadTimeMs } from "../../Libraries/Combat/gunCombat.js";
import { syncPickupWeaponState } from "../Combat/pickupWeaponState.js";
import { isSandboxEquippable } from "./sandboxCapabilities.js";
import { getPropAsset } from "../Props/PropCatalog.js";
let reloadBar = null;
let cooldownBar = null;
export function drawPickupWeaponBars(ctx, pickup, caches) {
    if (!pickup.turrets || pickup.turrets.length === 0) return;
    // Find first active turret's state to visualize
    const turret = pickup.turrets[0];
    if (!turret || !turret.gun) return;
    const gun = turret.gun;
    if (!reloadBar) reloadBar = new ProgressBar({ width: 24, height: 2, borderRadius: 1, quantizationSteps: 30, colorFn: () => "#FF9800" });
    if (!cooldownBar) cooldownBar = new ProgressBar({ width: 24, height: 2, borderRadius: 1, quantizationSteps: 30, colorFn: () => "#00BCD4" });
    let yOffset = pickup.radius ? -pickup.radius - 12 : -20;
    // Draw Reload Bar
    if (turret.reloading) {
        const reloadTimeMs = getSlotReloadTimeMs(gun, pickup);
        if (reloadTimeMs > 0) {
            const ratio = Math.min(1, turret.reloadTimer / reloadTimeMs);
            reloadBar.render(ctx, pickup.x, pickup.y + yOffset, ratio, caches);
            yOffset -= 4;
        }
    }
    // Draw charge bar (same cadence model as tower ChargedWeaponMode)
    if ((turret.charge ?? 0) > 0 && !turret.reloading) {
        const fireIntervalMs = getSlotFireIntervalMs(gun, pickup);
        if (fireIntervalMs > 0) {
            const ratio = Math.min(1, turret.charge / fireIntervalMs);
            cooldownBar.render(ctx, pickup.x, pickup.y + yOffset, ratio, caches);
        }
    }
}
/**
 * Charge/reload bars for every armed sandbox pickup (auto-combat + manual fire).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {import("../../Libraries/Canvas/SpriteCache.js").SpriteCache | null} [caches]
 */
export function drawSandboxWeaponBars(ctx, host, caches = null) {
    for (const pickup of host.getPickups()) {
        if (pickup.isDead || !pickup.weaponLoadout?.length) continue;
        if (!isSandboxEquippable(getPropAsset(pickup.type))) continue;
        syncPickupWeaponState(pickup);
        drawPickupWeaponBars(ctx, pickup, caches);
    }
}
