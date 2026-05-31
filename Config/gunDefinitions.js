import { enemyProjectileSettings, playerProjectileSettings } from "./Config.js";
import { Handedness } from "./equipmentConfig.js";

export const defaultGunId = "servicePistol";
export const defaultEnemyGunId = "enemyRifle";

/** Random equipment pools (1 slot). Enemies never roll beamLaser. */
export const playerStartGunPool = ["servicePistol", "shotgun", "sawedOffShotgun", "tommyGun"];
export const enemyStartGunPool = ["enemyRifle", "servicePistol"];

/** Guns the player can equip from the Equipment tab. */
export const playerEquipmentCatalog = ["servicePistol", "shotgun", "sawedOffShotgun", "tommyGun"];

/** All projectile hits and beam ticks deal flat damage (matches integer HP). */
const FLAT_DAMAGE = 1;

/** Fixed ballistics and damage per gun. */
export const projectilePresets = {
    playerStandard: {
        color: "#FFEB3B",
        shooterKnockbackMultiplier: playerProjectileSettings.knockbackMultiplier,
    },
    playerKnockback: {
        color: "#FFEB3B",
        shooterKnockbackMultiplier: playerProjectileSettings.knockbackMultiplier,
        impactKnockback: {
            stunMs: 700,
            pushMs: 280,
            pushSpeedMultiplier: 3,
        },
    },
    enemyStandard: {
        color: "#F44336",
        shooterKnockbackMultiplier: enemyProjectileSettings.knockbackMultiplier,
    },
};

export const gunDefinitions = {
    servicePistol: {
        id: "servicePistol",
        name: "Service Pistol",
        handedness: Handedness.ONE_HANDED,
        kind: "projectile",
        fireIntervalMs: 1000,
        muzzleSpeed: playerProjectileSettings.speed,
        bulletRadius: 6,
        damage: FLAT_DAMAGE,
        maxAmmo: 12,
        reloadTimeMs: 1200,
        turretLoadout: { preset: "standard" },
        projectile: projectilePresets.playerStandard,
    },
    shotgun: {
        id: "shotgun",
        name: "Shotgun",
        handedness: Handedness.TWO_HANDED,
        kind: "projectile",
        fireIntervalMs: 1000,
        muzzleSpeed: playerProjectileSettings.speed,
        bulletRadius: 6,
        damage: FLAT_DAMAGE,
        maxAmmo: 6,
        reloadTimeMs: 1800,
        turretLoadout: { preset: "shotgun" },
        projectile: projectilePresets.playerStandard,
    },
    sawedOffShotgun: {
        id: "sawedOffShotgun",
        name: "Sawed Off Shotgun",
        handedness: Handedness.TWO_HANDED,
        kind: "projectile",
        fireIntervalMs: 650,
        muzzleSpeed: playerProjectileSettings.speed,
        bulletRadius: 6,
        damage: FLAT_DAMAGE,
        maxAmmo: 2,
        reloadTimeMs: 2800,
        turretLoadout: { preset: "sawedOffShotgun" },
        projectile: projectilePresets.playerKnockback,
    },
    tommyGun: {
        id: "tommyGun",
        name: "Tommy Gun",
        handedness: Handedness.TWO_HANDED,
        kind: "projectile",
        fireIntervalMs: 120,
        muzzleSpeed: playerProjectileSettings.speed,
        bulletRadius: 6,
        damage: FLAT_DAMAGE,
        maxAmmo: 6,
        reloadTimeMs: 1500,
        turretLoadout: { preset: "standard" },
        projectile: projectilePresets.playerStandard,
    },
    beamLaser: {
        id: "beamLaser",
        name: "Beam Laser",
        handedness: Handedness.TWO_HANDED,
        kind: "beam",
        beamRadius: 1,
        tickIntervalMs: 200,
        beamGrowthSpeed: 200,
        tickDamage: FLAT_DAMAGE,
        maxAmmo: 25,
        reloadTimeMs: 2000,
        equipModifiers: {
            turnSpeedMultiplier: 0.5,
        },
    },
    enemyRifle: {
        id: "enemyRifle",
        name: "Enemy Rifle",
        handedness: Handedness.TWO_HANDED,
        kind: "projectile",
        fireIntervalMs: 1500,
        muzzleSpeed: enemyProjectileSettings.speed,
        bulletRadius: 6,
        damage: FLAT_DAMAGE,
        maxAmmo: 10,
        reloadTimeMs: 1500,
        turretLoadout: { preset: "standard" },
        projectile: projectilePresets.enemyStandard,
    },
};

export function getGunDefinition(gunId) {
    const gun = gunDefinitions[gunId];
    if (!gun) {
        throw new Error(`Unknown gun: ${gunId}`);
    }
    return gun;
}
