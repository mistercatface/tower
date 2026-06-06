export const spawnPods = [
    { id: "standard_trio", weight: 14, members: [{ type: "standard", count: 3 }] },
    { id: "standard_quartet", weight: 10, members: [{ type: "standard", count: 4 }] },
    { id: "tank_pair", weight: 10, members: [{ type: "tank", count: 2 }] },
    {
        id: "mixed_squad",
        weight: 12,
        members: [
            { type: "standard", count: 2 },
            { type: "tank", count: 1 },
        ],
    },
    { id: "kamikaze_pair", weight: 8, members: [{ type: "kamikaze", count: 2 }] },
    { id: "spastic_duo", weight: 6, members: [{ type: "spastic", count: 2 }] },
    { id: "dodger_trio", weight: 6, members: [{ type: "dodger", count: 3 }] },
    { id: "fast_pair", weight: 6, members: [{ type: "fast", count: 2 }] },
    { id: "lone_pumpkin", weight: 4, members: [{ type: "tank", count: 1 }] },
    { id: "lone_dodger", weight: 4, members: [{ type: "dodger", count: 1 }] },
];
export const spawnSettings = { spawnIntervalMs: 3000, maxActiveEnemies: 20 };
