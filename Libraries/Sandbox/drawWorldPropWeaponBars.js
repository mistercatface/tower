import { ProgressBar } from "../../Libraries/Canvas/ProgressBar.js";
import { getSlotFireIntervalMs, getSlotReloadTimeMs } from "../../Libraries/Combat/gunCombat.js";
import { forEachArmedSandboxWorldProp } from "./sandboxCapabilities.js";
let reloadBar = null;
let cooldownBar = null;
export function drawWorldPropWeaponBars(ctx, prop, caches) {
    if (!prop.turrets || prop.turrets.length === 0) return;
    // Find first active turret's state to visualize
    const turret = prop.turrets[0];
    if (!turret || !turret.gun) return;
    const gun = turret.gun;
    if (!reloadBar) reloadBar = new ProgressBar({ width: 24, height: 2, borderRadius: 1, quantizationSteps: 30, colorFn: () => "#FF9800" });
    if (!cooldownBar) cooldownBar = new ProgressBar({ width: 24, height: 2, borderRadius: 1, quantizationSteps: 30, colorFn: () => "#00BCD4" });
    let yOffset = prop.radius ? -prop.radius - 12 : -20;
    // Draw Reload Bar
    if (turret.reloading) {
        const reloadTimeMs = getSlotReloadTimeMs(gun, prop);
        if (reloadTimeMs > 0) {
            const ratio = Math.min(1, turret.reloadTimer / reloadTimeMs);
            reloadBar.render(ctx, prop.x, prop.y + yOffset, ratio, caches);
            yOffset -= 4;
        }
    }
    // Draw charge bar (same cadence model as tower ChargedWeaponMode)
    if ((turret.charge ?? 0) > 0 && !turret.reloading) {
        const fireIntervalMs = getSlotFireIntervalMs(gun, prop);
        if (fireIntervalMs > 0) {
            const ratio = Math.min(1, turret.charge / fireIntervalMs);
            cooldownBar.render(ctx, prop.x, prop.y + yOffset, ratio, caches);
        }
    }
}
/**
 * Charge/reload bars for every armed sandbox prop (auto-combat + manual fire).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {import("../../Libraries/Canvas/SpriteCache.js").SpriteCache | null} [caches]
 */
export function drawSandboxWeaponBars(ctx, host, caches = null) {
    forEachArmedSandboxWorldProp(host, (prop) => drawWorldPropWeaponBars(ctx, prop, caches));
}
