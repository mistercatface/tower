import { getGunDefinition } from "../config/content/guns.js";
export { getSlotFireIntervalMs, getSlotReloadTimeMs, getGunProjectileConfig } from "../../../Libraries/Combat/gunCombat.js";
import { getGunProjectileConfig } from "../../../Libraries/Combat/gunCombat.js";
import { getActiveEquipModifiers } from "../../../Libraries/Combat/gunModifiers.js";
export { getActiveEquipModifiers };
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
