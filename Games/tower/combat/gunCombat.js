import { defaultGunId, getGunDefinition, gunDefinitions } from "../config/content/guns.js";
import { getActiveEquipModifiers } from "../../../Libraries/Combat/gunModifiers.js";
export { getActiveEquipModifiers };
export function getSlotFireIntervalMs(gun, actor) {
    const multiplier = actor.stats?.fireIntervalMultiplier?.value ?? 1;
    return gun.fireIntervalMs * multiplier;
}
export function getSlotReloadTimeMs(gun, actor) {
    const speedMultiplier = actor.stats?.reloadSpeedMultiplier?.value ?? 1;
    return gun.reloadTimeMs / Math.max(speedMultiplier, 0.01);
}
export function getGunProjectileConfig(gun) {
    if (gun?.projectile) return gun.projectile;
    throw new Error(`Gun "${gun?.id ?? "unknown"}" is missing projectile config`);
}
export function getGunImpactKnockback(gun) {
    return getGunProjectileConfig(gun).impactKnockback ?? null;
}
export function applyActorGunModifiers(actor) {
    if (!actor.stats) return;
    let turnSpeedMult = 1;
    let accuracyFlatBonus = 0;
    for (const turret of actor.getTurrets()) {
        const gun = turret.gun ?? getGunDefinition(turret.gunId);
        const modifiers = getActiveEquipModifiers(gun);
        if (modifiers.turnSpeedMultiplier) turnSpeedMult *= modifiers.turnSpeedMultiplier;
        if (modifiers.accuracyFlatBonus) accuracyFlatBonus += modifiers.accuracyFlatBonus;
    }
    actor.turnSpeed = actor.stats.turnSpeed.value * turnSpeedMult;
    actor.setTurretTurnSpeed(actor.turnSpeed);
    if (actor.weapon) actor.weapon.accuracy = Math.min(1, actor.stats.accuracy.value + accuracyFlatBonus);
}
