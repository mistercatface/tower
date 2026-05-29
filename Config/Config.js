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
        groupSettings: { baseGroupSize: 2, growthPerWave: 1.0, maxGroupSize: 5 },
        canDamageWalls: true,
    },
    { type: "standard", weight: 60, radius: 6, baseSpeed: 100, baseHealth: 1, maxHealth: 500, color: "#F44336", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: false },
    { type: "fast", weight: 5, radius: 5, baseSpeed: 140, baseHealth: 0.5, maxHealth: 300, color: "#FFEB3B", minLevel: 2, spawnType: "single", attackType: "ranged", canDodge: false, canDamageWalls: true, },
    { type: "spastic", weight: 15, radius: 5, baseSpeed: 200, baseHealth: 0.3, maxHealth: 50, color: "#E91E63", minLevel: 3, spawnType: "group", attackType: "charge", canDodge: false, accelRate: 5, canDamageWalls: true, groupSettings: { baseGroupSize: 3, growthPerWave: 2.0, maxGroupSize: 5 } },
    { type: "tank", weight: 10, radius: 8, baseSpeed: 66, baseHealth: 3, maxHealth: 1200, color: "#9C27B0", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: false },
    { type: "dodger", weight: 20, radius: 6, baseSpeed: 100, baseHealth: 1, maxHealth: 450, color: "#03A9F4", minLevel: 3, spawnType: "single", attackType: "ranged", canDodge: true },
    { type: "boss", weight: 0, radius: 8, baseSpeed: 160, baseHealth: 50, maxHealth: 15000, color: "#B71C1C", minLevel: 0, spawnType: "single", attackType: "ranged", canDodge: true },
];

export const spawnSettings = { baseSpawnDelay: 3000, minSpawnDelay: 150, delayReductionPerWave: 150 };

export const difficultyCurve = { healthMultiplier: 1.015, speedMultiplier: 1.002, rewardMultiplier: 1.04 };

export const perkMilestones = [2, 4, 6, 8, 10, 12, 14, 16];

export const defaultUpgradeCost = 50;

export const playerBaseStats = {
    damage: 1,
    turnSpeed: Math.PI * 3,
    chargeTime: 1000,
    minChargeTime: 100,
    maxChargeTime: 1000,
    range: 150,
    maxHealth: 100,
    gameSpeed: 2.0,
    accuracy: 0.75,
    penetration: 0,
    moveSpeedMultiplier: 1.0,
    speed: 50,
    turretCount: 1,
    startingAbilities: ["Reposition"],
};

export const gridSettings = {
    cellSize: 16,
    width: 2400,
    height: 2400,
    minCellsPerChunk: 8,
    maxCellsPerChunk: 64,
};

export const navigationSettings = {
    arrivalDistance: 2,
    recenterThreshold: 400,
    stuckReplanFrames: 20,
    stuckMoveThreshold: 1.5,
    targetNodeLookahead: 10,
    pathClearanceMargin: 4,
    pathWaypointArrival: 10,
    hpaDamagePadding: 12,
};

export const NAV_PROFILES = {
    enemyToPlayer: { flowField: "enemy", hpaThreshold: 1000, replanMs: 1000, replanWhileMoving: true },
    playerClick: { flowField: "player", hpaThreshold: 0, replanMs: 500, replanWhileMoving: false },
};

export const mapSettings = {
    numLayers: 10,
    // Generators span ~1000px; combat coords use scale 7 (see GameState.getNodeCombatCoords).
    layerSpacing: 200,
    xSpacing: 200,
    nodeJitter: 12,
    combatCoordScale: 7.0,
};

export const playerProjectileSettings = {
    speed: 250,
    radiusMultiplier: 0.25,
    splitRadiusMultiplier: 0.125,
    knockbackMultiplier: 200,
};

export const enemyProjectileSettings = {
    speed: 150,
    radiusMultiplier: 0.333,
    damage: 10,
    knockbackMultiplier: 120,
};

export const THEME_COLORS = [
    { r: 0, g: 188, b: 212 },
    { r: 76, g: 175, b: 80 },
    { r: 255, g: 152, b: 0 },
    { r: 156, g: 39, b: 176 },
    { r: 63, g: 81, b: 181 },
    { r: 244, g: 67, b: 54 },
    { r: 233, g: 30, b: 99 },
    { r: 0, g: 150, b: 136 },
    { r: 205, g: 220, b: 57 },
    { r: 121, g: 85, b: 72 },
];

export const pickupSpawnSettings = {
    barrelMinCount: 25,
    barrelRandomRange: 125,
    barrelMinRadius: 150,
    barrelMaxRadius: 1000,
    crateMinCount: 8,
    crateRandomRange: 17,
    crateMinRadius: 150,
    crateMaxRadius: 1000,
};

export const controlSettings = {
    doubleTapTimeout: 300,
    scrollZoomSensitivity: -0.001,
};

export const timingSettings = {
    sectorCompletedDelay: 1500,
};