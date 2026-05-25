export const enemyTypes = [
    {
        type: "kamikaze",
        weight: 5,
        radius: 4,
        baseSpeed: 80,
        baseHealth: 0.25,
        color: "#FF9800",
        minLevel: 0,
        spawnType: "group",
        attackType: "charge",
        canDodge: false,
        groupSettings: { baseGroupSize: 2, growthPerWave: 0.1 },
    },
    { type: "standard", weight: 60, radius: 6, baseSpeed: 50, baseHealth: 1, color: "#F44336", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: false },
    { type: "fast", weight: 5, radius: 5, baseSpeed: 70, baseHealth: 0.5, color: "#FFEB3B", minLevel: 2, spawnType: "single", attackType: "ranged", canDodge: false },
    { type: "tank", weight: 10, radius: 8, baseSpeed: 33, baseHealth: 3, color: "#9C27B0", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: false },
    { type: "dodger", weight: 20, radius: 6, baseSpeed: 50, baseHealth: 1, color: "#03A9F4", minLevel: 3, spawnType: "single", attackType: "ranged", canDodge: true },
    { type: "boss", weight: 0, radius: 8, baseSpeed: 20, baseHealth: 50, color: "#B71C1C", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: false },
];

export const spawnSettings = { baseSpawnDelay: 2500, minSpawnDelay: 300, delayReductionPerWave: 150 };

export const difficultyCurve = { healthMultiplier: 1.015, speedMultiplier: 1.002, rewardMultiplier: 1.04 };

export const perkMilestones = [2, 4, 6, 8, 10, 12, 14, 16];

export const defaultUpgradeCost = 50;