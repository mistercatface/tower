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
    { type: "zombie", radius: combatActorRadius, baseSpeed: 85, maxHealth: 2, color: "#8BC34A", attackType: "charge", canDodge: false, accelRate: 2.5 },
];

export const spawnPods = [
    { id: "standard_trio", weight: 14, members: [{ type: "standard", count: 3 }] },
    { id: "standard_quartet", weight: 10, members: [{ type: "standard", count: 4 }] },
    { id: "tank_pair", weight: 10, members: [{ type: "tank", count: 2 }] },
    { id: "mixed_squad", weight: 12, members: [{ type: "standard", count: 2 }, { type: "tank", count: 1 }] },
    { id: "kamikaze_pair", weight: 8, members: [{ type: "kamikaze", count: 2 }] },
    { id: "spastic_duo", weight: 6, members: [{ type: "spastic", count: 2 }] },
    { id: "dodger_trio", weight: 6, members: [{ type: "dodger", count: 3 }] },
    { id: "fast_pair", weight: 6, members: [{ type: "fast", count: 2 }] },
    { id: "lone_pumpkin", weight: 4, members: [{ type: "tank", count: 1 }] },
    { id: "lone_dodger", weight: 4, members: [{ type: "dodger", count: 1 }] },
];

export const spawnSettings = {
    spawnIntervalMs: 3000,
    maxActiveEnemies: 20,
};
