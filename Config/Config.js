/** Shared collision + kinematics radius for all combat humanoids (for now). */
export const combatActorRadius = 8;

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
    { type: "tank", radius: combatActorRadius, baseSpeed: 50, maxHealth: 6, color: "#FF9800", attackType: "ranged", canDodge: false },
    { type: "standard", radius: combatActorRadius, baseSpeed: 75, maxHealth: 3, color: "#F44336", attackType: "ranged", canDodge: false },
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
    { type: "dodger", radius: combatActorRadius, baseSpeed: 75, maxHealth: 4, color: "#03A9F4", attackType: "ranged", canDodge: true },
    { type: "boss", radius: combatActorRadius, baseSpeed: 115, maxHealth: 6, color: "#B71C1C", attackType: "ranged", canDodge: true },
];

/** Weighted spawn compositions — one pod spawns per spawn tick, all members together. */
export const spawnPods = [
    // --- Cranberry-focused (higher weight so they actually show up) ---
    { id: "cranberry_squad", weight: 28, members: [{ type: "spastic", count: 5 }] },
    { id: "cranberry_burst", weight: 26, members: [{ type: "spastic", count: 4 }] },
    { id: "cranberry_swarm", weight: 24, members: [{ type: "spastic", count: 6 }] },
    { id: "cranberry_trio", weight: 24, members: [{ type: "spastic", count: 3 }] },
    { id: "cranberry_pair", weight: 22, members: [{ type: "spastic", count: 2 }] },
    { id: "lone_cranberry", weight: 18, members: [{ type: "spastic", count: 1 }] },
    {
        id: "charge_brigade",
        weight: 20,
        members: [
            { type: "kamikaze", count: 3 },
            { type: "spastic", count: 3 },
        ],
    },
    {
        id: "charge_mix",
        weight: 18,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "spastic", count: 3 },
        ],
    },

    // --- Mixed pods (most include cranberries) ---
    {
        id: "starter_mix",
        weight: 16,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "standard", count: 2 },
            { type: "spastic", count: 1 },
        ],
    },
    {
        id: "pea_tomato_pumpkin_mix",
        weight: 14,
        members: [
            { type: "kamikaze", count: 3 },
            { type: "standard", count: 4 },
            { type: "tank", count: 2 },
            { type: "spastic", count: 1 },
        ],
    },
    {
        id: "elite_mix",
        weight: 14,
        members: [
            { type: "dodger", count: 2 },
            { type: "spastic", count: 3 },
            { type: "tank", count: 1 },
        ],
    },
    {
        id: "full_assault",
        weight: 12,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "standard", count: 2 },
            { type: "fast", count: 2 },
            { type: "spastic", count: 1 },
            { type: "dodger", count: 1 },
        ],
    },
    {
        id: "mixed_three",
        weight: 12,
        members: [
            { type: "kamikaze", count: 1 },
            { type: "standard", count: 1 },
            { type: "spastic", count: 1 },
        ],
    },
    {
        id: "pea_tomato_cranberry",
        weight: 14,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "standard", count: 2 },
            { type: "spastic", count: 2 },
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
    { id: "pea_rush", weight: 8, members: [{ type: "kamikaze", count: 5 }] },
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
    {
        id: "pea_tomato_pair",
        weight: 8,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "standard", count: 2 },
        ],
    },
    { id: "triple_pea", weight: 6, members: [{ type: "kamikaze", count: 3 }] },
    { id: "dodger_trio", weight: 6, members: [{ type: "dodger", count: 3 }] },
    { id: "fast_pair", weight: 6, members: [{ type: "fast", count: 2 }] },
    {
        id: "pumpkin_pea",
        weight: 6,
        members: [
            { type: "tank", count: 1 },
            { type: "kamikaze", count: 1 },
        ],
    },
    { id: "lone_pumpkin", weight: 4, members: [{ type: "tank", count: 1 }] },
    { id: "lone_dodger", weight: 4, members: [{ type: "dodger", count: 1 }] },
];

/** Wave 1 only — tomato, pumpkin, and sometimes pea (kamikaze). Pods are 3–5 enemies, ≤2 chargers. */
export const firstWaveSpawnPods = [
    { id: "fw_tomato_five", weight: 22, members: [{ type: "standard", count: 5 }] },
    { id: "fw_tomato_four", weight: 20, members: [{ type: "standard", count: 4 }] },
    { id: "fw_tomato_three", weight: 18, members: [{ type: "standard", count: 3 }] },
    { id: "fw_pumpkin_four", weight: 18, members: [{ type: "tank", count: 4 }] },
    { id: "fw_pumpkin_three", weight: 16, members: [{ type: "tank", count: 3 }] },
    {
        id: "fw_pumpkin_tomato_five",
        weight: 20,
        members: [
            { type: "tank", count: 2 },
            { type: "standard", count: 3 },
        ],
    },
    {
        id: "fw_pumpkin_tomato_four",
        weight: 18,
        members: [
            { type: "tank", count: 2 },
            { type: "standard", count: 2 },
        ],
    },
    {
        id: "fw_pumpkin_tomato_three",
        weight: 16,
        members: [
            { type: "tank", count: 1 },
            { type: "standard", count: 2 },
        ],
    },
    {
        id: "fw_pea_tomato_five",
        weight: 10,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "standard", count: 3 },
        ],
    },
    {
        id: "fw_pea_tomato_four",
        weight: 10,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "standard", count: 2 },
        ],
    },
    {
        id: "fw_pea_light_four",
        weight: 8,
        members: [
            { type: "kamikaze", count: 1 },
            { type: "standard", count: 3 },
        ],
    },
    {
        id: "fw_pea_pumpkin_tomato",
        weight: 8,
        members: [
            { type: "kamikaze", count: 2 },
            { type: "tank", count: 1 },
            { type: "standard", count: 2 },
        ],
    },
    {
        id: "fw_pea_pumpkin_pair",
        weight: 6,
        members: [
            { type: "kamikaze", count: 1 },
            { type: "tank", count: 1 },
            { type: "standard", count: 2 },
        ],
    },
];

export const spawnSettings = { baseSpawnDelay: 3000, minSpawnDelay: 150, delayReductionPerWave: 150 };

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
    startingAbilities: ["Reposition", "Shoot"],
};

export const gridSettings = { cellSize: 16, width: 2400, height: 2400, minCellsPerChunk: 8, maxCellsPerChunk: 64 };

/** Floor render chunks — one offscreen canvas per chunk, aligned to gridSettings.cellSize. */
export const floorTileSettings = {
    cellsPerChunk: gridSettings.minCellsPerChunk,
    viewPaddingPx: 128,
    maxCachedChunks: 512,
    /** Soft radial darkening on top of tiles (0 = off). */
    vignetteAlpha: 0.45,
    /** World size of one repeating floor tile on wall faces. */
    tileWorldSize: gridSettings.cellSize,
    /**
     * Global wall projection height (rendering only — not per-building).
     * Defaults near CAMERA_HEIGHT so faces extend offscreen without a visible cap.
     */
    wallVisualHeight: null,
    /** Fixed vertical tile count for wall textures (camera-independent). */
    wallTextureStories: 16,
    /** Darken wall tiles vs floor (0 = none, 1 = black). */
    wallShadeOverlay: 0.22,
    /** Overlap when affine-mapping wall cells (hides triangle seam). */
    wallTextureBleedPx: 1,
    maxCachedWallCells: 8192,
};

export const combatVisualSettings = { floorHighlight: "#2c3340", floorFill: "#1c2129", floorShadow: "#12161c", gridStroke: "rgba(90, 105, 125, 0.2)" };

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

export const mapSettings = { numLayers: 10, layerSpacing: 200, xSpacing: 200, nodeJitter: 12, combatCoordScale: 7.0 };

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

export const THEME_COLORS = [
    { r: 245, g: 245, b: 247 }, // 1. Near-White / Light Silver (High Brightness)
    { r: 40, g: 45, b: 50 },    // 2. Dark Charcoal (High Contrast / Dark)
    { r: 110, g: 130, b: 155 }, // 3. Cool Bluish Slate (Cool Tint)
    { r: 185, g: 180, b: 170 }, // 4. Warm Concrete / Putty (Warm Tint)
    { r: 120, g: 135, b: 120 }, // 5. Mossy Stone Gray (Greenish Tint)
    { r: 210, g: 215, b: 220 }, // 6. Reflective Silver Steel (Light Gray)
    { r: 95, g: 85, b: 80 },    // 7. Reddish Dark Iron (Warm Dark Gray)
    { r: 130, g: 150, b: 170 }, // 8. Steel Blue (Bluish Light Gray)
    { r: 160, g: 150, b: 140 }, // 9. Sandstone / Earthy Gray (Muted Brown-Gray)
    { r: 140, g: 140, b: 140 }, // 10. Neutral Medium Gray (Standard Gray)
];

export const controlSettings = { doubleTapTimeout: 300, scrollZoomSensitivity: -0.001 };

export const timingSettings = { sectorCompletedDelay: 1500 };

/** TEMP: skip wave 1 on start node and enter inspection mode immediately. */
export const debugStartNodeInspectionImmediate = false;
