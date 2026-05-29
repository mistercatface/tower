import { enemyProjectileSettings, playerProjectileSettings } from "./Config.js";

export const defaultGunId = "servicePistol";
export const defaultEnemyGunId = "enemyRifle";

/** Random equipment pools (1 slot). Enemies never roll beamLaser. */
export const playerStartGunPool = ["servicePistol", "beamLaser"];
export const enemyStartGunPool = ["enemyRifle", "servicePistol"];

/** Fixed ballistics and damage per gun. */
export const gunDefinitions = {
    servicePistol: {
        id: "servicePistol",
        name: "Service Pistol",
        kind: "projectile",
        fireIntervalMs: 1000,
        muzzleSpeed: playerProjectileSettings.speed,
        bulletRadius: 2,
        damage: 1,
    },
    beamLaser: {
        id: "beamLaser",
        name: "Beam Laser",
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
        name: "Enemy Rifle",
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
