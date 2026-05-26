export const enemyTypes = [
    {
        type: "kamikaze",
        weight: 15,
        radius: 5,
        baseSpeed: 160,
        baseHealth: 0.25,
        maxHealth: 200,
        color: "#FF9800",
        minLevel: 0,
        spawnType: "group",
        attackType: "charge",
        canDodge: false,
        accelRate: 1.0,
        groupSettings: { baseGroupSize: 2, growthPerWave: 1.0 },
        canDamageWalls: true,
    },
    { type: "standard", weight: 60, radius: 6, baseSpeed: 100, baseHealth: 1, maxHealth: 500, color: "#F44336", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: false },
    { type: "fast", weight: 5, radius: 5, baseSpeed: 140, baseHealth: 0.5, maxHealth: 300, color: "#FFEB3B", minLevel: 2, spawnType: "single", attackType: "ranged", canDodge: false, canDamageWalls: true, },
    { type: "spastic", weight: 15, radius: 5, baseSpeed: 200, baseHealth: 0.3, maxHealth: 50, color: "#E91E63", minLevel: 3, spawnType: "group", attackType: "charge", canDodge: false, accelRate: 5, canDamageWalls: true, groupSettings: { baseGroupSize: 3, growthPerWave: 2.0 } },
    { type: "tank", weight: 10, radius: 8, baseSpeed: 66, baseHealth: 3, maxHealth: 1200, color: "#9C27B0", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: false },
    { type: "dodger", weight: 20, radius: 6, baseSpeed: 100, baseHealth: 1, maxHealth: 450, color: "#03A9F4", minLevel: 3, spawnType: "single", attackType: "ranged", canDodge: true },
    { type: "boss", weight: 0, radius: 8, baseSpeed: 160, baseHealth: 50, maxHealth: 15000, color: "#B71C1C", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: true },
];

export const spawnSettings = { baseSpawnDelay: 3000, minSpawnDelay: 150, delayReductionPerWave: 150 };

export const difficultyCurve = { healthMultiplier: 1.015, speedMultiplier: 1.002, rewardMultiplier: 1.04 };

export const perkMilestones = [2, 4, 6, 8, 10, 12, 14, 16];

export const defaultUpgradeCost = 50;