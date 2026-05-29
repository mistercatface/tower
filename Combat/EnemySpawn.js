import { difficultyCurve, enemyDefaults, enemyBaseStats } from "../Config/Config.js";
import { baseUpgradeEffects } from "../Config/UpgradeDefinitions.js";

export function buildEnemyCombatStats(enemyType) {
    const range = enemyDefaults.rangeMin + Math.floor(Math.random() * (enemyDefaults.rangeMax - enemyDefaults.rangeMin + 1));
    return {
        ...enemyBaseStats,
        speed: enemyType.baseSpeed,
        maxHealth: enemyBaseStats.maxHealth,
        range,
    };
}

export function computeSpawnReward(wave, enemyType) {
    const waveFactor = Math.pow(difficultyCurve.rewardMultiplier, wave - 1);
    return Math.max(1, Math.floor(enemyType.baseHealth * waveFactor));
}

export function computeEnemyUpgradeLevels(wave, enemyType, combatBaseStats) {
    const { healthPerLevel, moveSpeedPerLevel, moveSpeedMaxLevel } = baseUpgradeEffects;

    const healthWaveFactor = Math.pow(difficultyCurve.healthMultiplier, wave - 1);
    const typeHealthTier = Math.max(1, Math.floor(enemyType.baseHealth * healthWaveFactor));

    let healthLevel = Math.max(0, Math.round((typeHealthTier - combatBaseStats.maxHealth) / healthPerLevel));
    if (enemyType.maxHealth !== undefined) {
        const maxHealthLevel = Math.max(0, Math.floor((enemyType.maxHealth - combatBaseStats.maxHealth) / healthPerLevel));
        healthLevel = Math.min(healthLevel, maxHealthLevel);
    }

    const speedWaveFactor = Math.pow(difficultyCurve.speedMultiplier, wave - 1);
    const moveSpeedLevel = Math.max(0, Math.min(
        moveSpeedMaxLevel,
        Math.round((speedWaveFactor - 1) / moveSpeedPerLevel)
    ));

    return {
        Damage: 0,
        Accuracy: 0,
        Penetration: 0,
        Speed: 0,
        Charge: 0,
        Range: 0,
        Health: healthLevel,
        Regen: 0,
        MoveSpeed: moveSpeedLevel,
    };
}
