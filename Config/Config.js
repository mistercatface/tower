/** Shared collision + kinematics radius for all combat humanoids (for now). */
export const combatActorRadius = 8;

/** Internal kinematics render resolution (rig + offscreen canvas scale). */
export const kinematicsPixelSize = 32;

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
    // --- Mixed pods (most include cranberries) ---
    {
        id: "starter_mix",
        weight: 16,
        members: [
            { type: "standard", count: 2 },
        ],
    },
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

    // --- Other archetypes (lower weight) ---
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

export const spawnSettings = { baseSpawnDelay: 3000, minSpawnDelay: 800, delayReductionPerWave: 150, maxActiveEnemies: 20 };

export const progressionSettings = { xpBase: 25, xpExponent: 1.5, upgradeCostMultiplier: 1.5 };

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

export const mapGenerationSettings = {
    startNodeWaves: 1,
    nodesPerLayerMin: 2,
    nodesPerLayerMax: 4,
    wavesTotalMin: 1,
    wavesTotalMax: 5,
    extraConnectionChance: 0.3,
};

export const difficultyCurve = { rewardMultiplier: 1.04 };

export const perkMilestones = [2, 4, 6, 8, 10, 12, 14, 16];

export const defaultUpgradeCost = 50;

export const perkSettings = { baseCostReduction: 10, recoverySectorHealRatio: 0.5, regenerateLevelBonus: 5, fireRateChargeTimeDivisor: 1.1, xpGainMultiplier: 2, startingWealthPoints: 250 };

export const runBaseStats = { gameSpeed: 2.0, pointBonus: 0, baseUpgradeCost: defaultUpgradeCost, turretCount: 1 };

export const sidekickBaseStats = { turnSpeed: Math.PI * 2.5, range: 150, maxHealth: 10, accuracy: 0.7, penetration: 0, speed: 55 };

export const playerBaseStats = {
    turnSpeed: Math.PI * 3,
    range: 150,
    maxHealth: 10,
    accuracy: 0.75,
    penetration: 0,
    moveSpeedMultiplier: 1.0,
    fireIntervalMultiplier: 1.0,
    reloadSpeedMultiplier: 1.0,
    speed: 50,
    startingAbilities: ["Reposition"],
};

export const gridSettings = { cellSize: 16, width: 2400, height: 2400, minCellsPerChunk: 8, maxCellsPerChunk: 64 };

/** Floor render chunks — one offscreen canvas per chunk, aligned to gridSettings.cellSize. */
export const floorTileSettings = {
    cellsPerChunk: gridSettings.minCellsPerChunk,
    tileResolution: 6,
    viewPaddingPx: 128,
    preLoadPaddingPx: 512,
    maxCachedChunks: 512,
    chunkCacheTiles: 128,
    chunkWorldSize: 128 * gridSettings.cellSize,
    tileWorldSize: gridSettings.cellSize,
    wallVisualHeight: null,
    wallTextureStories: 5,
    wallTextureBleedPx: 1,
    floorAnimationsOn: false,
    wallAnimationsOn: false,
};

export const combatVisualSettings = { 
    floorHighlight: "#2c3340", 
    floorFill: "#1c2129", 
    floorShadow: "#12161c", 
    gridStroke: "rgba(90, 105, 125, 0.2)",
    bloom: {
        enabled: true,
        blur: 2,
    }
};

/** Classic circle + turret HUD (H cycles modes). */
export const COMBAT_HUD_MODE = {
    OFF: 0,
    OVERLAY: 1,
    CLASSIC: 2,
};

export const COMBAT_HUD_MODE_COUNT = 3;

export const COMBAT_HUD_MODE_LABELS = ["off", "overlay", "classic"];

export const hudSettings = {
    combatOverlayAlpha: 0.72,
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
    playerClick: { flowField: "player", hpaThreshold: 0, replanMs: 500, replanWhileMoving: false, skipPathClearance: true },
    mapTravel: { flowField: "player", hpaThreshold: 0, replanMs: 250, replanWhileMoving: true },
    sidekickFollow: { flowField: "enemy", hpaThreshold: 60, replanMs: 250, replanWhileMoving: true },
};

export const mapSettings = { numLayers: 5, layerSpacing: 170, xSpacing: 170, nodeJitter: 0, combatCoordScale: 7.0 };

export const playerProjectileSettings = { speed: 250, radiusMultiplier: 0.25, splitRadiusMultiplier: 0.125, knockbackMultiplier: 200 };

export const enemyProjectileSettings = { speed: 150, radiusMultiplier: 0.333, knockbackMultiplier: 120 };

export const enemyDefaults = {
    rangeMin: 75,
    rangeMax: 144,
    chargeImpactDamage: 2,
    chargeDashSpeedMultiplier: 1.35,
    chargeDashAccelMultiplier: 2.5,
};

export const explosionSettings = { defaultDamage: 5, barrelDamage: 5, wallBlastDamage: 5, playerMultipliers: [1, 0.5], enemyMultipliers: [1.6, 0.4] };

export const enemyBaseStats = { turnSpeed: 10, range: 112, accuracy: 0.9, penetration: 0, moveSpeedMultiplier: 1.0, fireIntervalMultiplier: 1.0, reloadSpeedMultiplier: 1.0, speed: 75 };



export const controlSettings = { doubleTapTimeout: 300, scrollZoomSensitivity: -0.001 };

export const timingSettings = { sectorCompletedDelay: 1500 };

/** TEMP: skip wave 1 on start node and enter inspection mode immediately. */
export const debugStartNodeInspectionImmediate = false;
