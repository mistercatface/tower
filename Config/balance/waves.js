import { combatActorRadius } from "./actors.js";

export const enemyTypes = [
    {
        type: "kamikaze",
        radius: combatActorRadius,
        baseSpeed: 115,
        maxHealth: 2,
        color: "#FF9800",
        attackType: "charge",
        canDodge: false,
        accelRate: 1.0,
        canDamageWalls: true,
    },
    { type: "tank", radius: combatActorRadius, baseSpeed: 50, maxHealth: 3, color: "#FF9800", attackType: "ranged", canDodge: false },
    { type: "standard", radius: combatActorRadius, baseSpeed: 75, maxHealth: 2, color: "#F44336", attackType: "ranged", canDodge: false },
    { type: "fast", radius: combatActorRadius, baseSpeed: 102, maxHealth: 2, color: "#FFEB3B", attackType: "ranged", canDodge: false, canDamageWalls: true },
    {
        type: "spastic",
        radius: combatActorRadius,
        baseSpeed: 95,
        maxHealth: 2,
        color: "#C62828",
        attackType: "charge",
        canDodge: false,
        accelRate: 3,
        canDamageWalls: true,
    },
    { type: "dodger", radius: combatActorRadius, baseSpeed: 75, maxHealth: 2, color: "#03A9F4", attackType: "ranged", canDodge: true },
    { type: "boss", radius: combatActorRadius, baseSpeed: 115, maxHealth: 3, color: "#B71C1C", attackType: "ranged", canDodge: true },
    {
        type: "zombie",
        radius: combatActorRadius,
        baseSpeed: 25,
        maxHealth: 2,
        color: "#4CAF50",
        attackType: "charge",
        canDodge: false,
        accelRate: 3,
        canDamageWalls: true,
    },
];

export const spawnPods = [
    { id: "starter_mix", weight: 16, members: [{ type: "standard", count: 2 }] },
    {
        id: "pea_tomato_pumpkin_mix",
        weight: 14,
        members: [
            { type: "standard", count: 4 },
            { type: "tank", count: 2 },
        ],
    },
    {
        id: "elite_mix",
        weight: 14,
        members: [
            { type: "dodger", count: 2 },
            { type: "tank", count: 1 },
        ],
    },
    {
        id: "legume_tomato_mix",
        weight: 14,
        members: [
            { type: "dodger", count: 1 },
            { type: "fast", count: 1 },
            { type: "standard", count: 3 },
        ],
    },
    { id: "tomato_squad", weight: 8, members: [{ type: "standard", count: 5 }] },
    { id: "pumpkin_heavy", weight: 8, members: [{ type: "tank", count: 5 }] },
    {
        id: "pumpkin_wall",
        weight: 8,
        members: [
            { type: "tank", count: 4 },
            { type: "standard", count: 4 },
        ],
    },
    {
        id: "fast_skirmish",
        weight: 10,
        members: [
            { type: "fast", count: 4 },
            { type: "standard", count: 2 },
        ],
    },
    {
        id: "ranged_squad",
        weight: 10,
        members: [
            { type: "standard", count: 2 },
            { type: "dodger", count: 2 },
            { type: "fast", count: 2 },
        ],
    },
    {
        id: "dodger_flank",
        weight: 8,
        members: [
            { type: "dodger", count: 3 },
            { type: "standard", count: 2 },
        ],
    },
    {
        id: "tomato_tank_duo",
        weight: 8,
        members: [
            { type: "standard", count: 3 },
            { type: "tank", count: 2 },
        ],
    },
    { id: "fast_lance", weight: 8, members: [{ type: "fast", count: 4 }] },
    { id: "dodger_trio", weight: 6, members: [{ type: "dodger", count: 3 }] },
    { id: "fast_pair", weight: 6, members: [{ type: "fast", count: 2 }] },
    { id: "lone_pumpkin", weight: 4, members: [{ type: "tank", count: 1 }] },
    { id: "lone_dodger", weight: 4, members: [{ type: "dodger", count: 1 }] },
];

export const firstWaveSpawnPods = [
    {
        id: "fw_pumpkin_tomato_five",
        weight: 20,
        members: [
            { type: "tank", count: 2 },
            { type: "standard", count: 3 },
        ],
    },
];

export const spawnSettings = {
    baseSpawnDelay: 3000,
    minSpawnDelay: 800,
    delayReductionPerWave: 150,
    maxActiveEnemies: 20,
};

export const waveSettings = {
    bossWaveInterval: 10,
    firstWaveEnemyCount: 5,
    postBossBaseCount: 5,
    earlyWaveCap: 10,
    postBossMultiplierEarly: 3,
    postBossMultiplierLate: 6,
    earlyWaveGrowth: 3,
    lateWaveGrowthBase: 8,
    lateWaveGrowthDivisor: 5,
    podSpacing: 40,
};
