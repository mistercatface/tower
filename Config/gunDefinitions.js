import { enemyProjectileSettings, playerProjectileSettings } from "./Config.js";

export const defaultGunId = "servicePistol";
export const defaultEnemyGunId = "enemyRifle";

/** Fixed ballistics and damage per gun. */
export const gunDefinitions = {
    servicePistol: {
        id: "servicePistol",
        kind: "projectile",
        fireIntervalMs: 1000,
        muzzleSpeed: playerProjectileSettings.speed,
        bulletRadius: 2,
        damage: 1,
    },
    beamLaser: {
        id: "beamLaser",
        kind: "beam",
        beamRadius: 1,
        tickIntervalMs: 200,
        beamGrowthSpeed: 200,
        tickDamage: 0.33,
        equipModifiers: {
            turnSpeedMultiplier: 0.5,
        },
    },
    enemyRifle: {
        id: "enemyRifle",
        kind: "projectile",
        fireIntervalMs: 1500,
        muzzleSpeed: enemyProjectileSettings.speed,
        bulletRadius: 2,
        damage: 10,
    },
};

export function getGunDefinition(gunId) {
    const gun = gunDefinitions[gunId];
    if (!gun) {
        throw new Error(`Unknown gun: ${gunId}`);
    }
    return gun;
}
