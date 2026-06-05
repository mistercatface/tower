import { enemyDefaults, enemyBaseStats } from "../Config/Config.js";

export function buildEnemyCombatStats(enemyType) {
    const range = enemyDefaults.rangeMin + Math.floor(Math.random() * (enemyDefaults.rangeMax - enemyDefaults.rangeMin + 1));
    return {
        ...enemyBaseStats,
        speed: enemyType.baseSpeed,
        maxHealth: enemyType.maxHealth,
        range,
    };
}

export function computeSpawnReward(enemyType) {
    return Math.max(1, enemyType.maxHealth);
}

export function computeEnemyUpgradeLevels() {
    return {
        Accuracy: 0,
        Penetration: 0,
        Speed: 0,
        Range: 0,
        Regen: 0,
        MoveSpeed: 0,
    };
}
