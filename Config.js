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
        groupSettings: { baseGroupSize: 2, growthPerWave: 0.1 },
    },
    { type: "standard", weight: 60, radius: 6, baseSpeed: 50, baseHealth: 1, color: "#F44336", minLevel: 0, spawnType: "single", attackType: "ranged" },
    { type: "fast", weight: 5, radius: 5, baseSpeed: 70, baseHealth: 0.5, color: "#FFEB3B", minLevel: 2, spawnType: "single", attackType: "ranged" },
    { type: "tank", weight: 10, radius: 8, baseSpeed: 33, baseHealth: 3, color: "#9C27B0", minLevel: 0, spawnType: "single", attackType: "ranged" },
    { type: "dodger", weight: 20, radius: 6, baseSpeed: 50, baseHealth: 1, color: "#03A9F4", minLevel: 3, spawnType: "single", attackType: "ranged" },
    { type: "boss", weight: 0, radius: 8, baseSpeed: 20, baseHealth: 50, color: "#B71C1C", minLevel: 0, spawnType: "single", attackType: "ranged" },
];

export const spawnSettings = { baseSpawnDelay: 2500, minSpawnDelay: 300, delayReductionPerWave: 25 };

export const difficultyCurve = { healthMultiplier: 1.15, speedMultiplier: 1.01, rewardMultiplier: 1.15 };

export const perkMilestones = [2, 4, 6, 8, 10, 12, 14, 16];

export const defaultUpgradeCost = 50;
