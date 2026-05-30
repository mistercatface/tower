import { defaultGunId, getGunDefinition, gunDefinitions } from "../Config/gunDefinitions.js";

export function getSlotFireIntervalMs(gun, actor) {
    const multiplier = actor.stats?.fireIntervalMultiplier?.value ?? 1;
    return gun.fireIntervalMs * multiplier;
}

export function getGunProjectileConfig(gun) {
    if (gun?.projectile) {
        return gun.projectile;
    }
    throw new Error(`Gun "${gun?.id ?? "unknown"}" is missing projectile config`);
}

export function applyActorGunModifiers(actor) {
    if (!actor.stats) return;

    let turnSpeedMult = 1;
    for (const turret of actor.getTurrets()) {
        const gun = gunDefinitions[turret.gunId] ?? gunDefinitions[defaultGunId];
        if (gun.equipModifiers?.turnSpeedMultiplier) {
            turnSpeedMult *= gun.equipModifiers.turnSpeedMultiplier;
        }
    }

    actor.turnSpeed = actor.stats.turnSpeed.value * turnSpeedMult;
    actor.setTurretTurnSpeed(actor.turnSpeed);
}
