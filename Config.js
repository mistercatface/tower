export const enemyTypes = [
    { type: "standard", weight: 60, radius: 6, baseSpeed: 50, baseHealth: 1, color: "#F44336", minLevel: 0 },
    { type: "fast", weight: 10, radius: 5, baseSpeed: 85, baseHealth: 0.5, color: "#FF9800", minLevel: 2 },
    { type: "tank", weight: 10, radius: 8, baseSpeed: 33, baseHealth: 3, color: "#9C27B0", minLevel: 0 },
    { type: "dodger", weight: 20, radius: 6, baseSpeed: 50, baseHealth: 1, color: "#03A9F4", minLevel: 3 },
    { type: "boss", weight: 0, radius: 8, baseSpeed: 20, baseHealth: 50, color: "#B71C1C", minLevel: 0 }
];

export const difficultyCurve = {
    healthMultiplier: 1.2,
    speedMultiplier: 1.02,
    rewardMultiplier: 1.15
};

export const perkMilestones = [2, 4, 6, 8, 10, 12, 14, 16];

export const defaultUpgradeCost = 50;