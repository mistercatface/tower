/** Minimum pre-impact speed for kinetic wall chips and striker snake cuts. */
export const SNAKE_KINETIC_MIN_STRIKE_SPEED = 28;
/** Snake autosim gameplay defaults — spacing/eat radius derived from prop radii at runtime. */
export const SNAKE_GAME_DEFAULTS = {
    segmentPropId: "ball",
    headPropId: "snake_head",
    goalPropId: "goal_orb",
    snakeCount: 100,
    goalCount: 0,
    segmentCount: 3,
    /** Center-to-center rest length = segment diameter × linkSlack. */
    linkSlack: 1.05,
    eatMargin: 2,
    growDirX: -1,
    growDirY: 0,
    /** Optional cap on head roll speed; null uses global groundNavRoll.maxSpeed. */
    headMaxSpeed: 250,
    /** Damping/friction applied to the head. */
    headFriction: 2.0,
    /** Damping/friction applied to the follower segments. */
    segmentFriction: 2.25,
    /** Density of snake follower segments (default ball is 0.007958). */
    segmentDensity: 0.001,
    /** Head acceleration override; null uses global groundNavRoll.accel. */
    headAccel: 200,
    hudHighScoreStorageKey: "snakeHighScore",
    startRadius: 2,
    maxRadius: 4,
    radiusPerMeal: 0.25,
    cavern: { mapSeedOffset: 11, wallHeightLevel: 1, regionPaddingCells: 4, fillChance: 0.48, iterations: 4, openBoundaryRows: 3 },
    rail: { wallHeightLevel: 1, edgeThickness: 1, corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 },
    showVisionCones: false,
    showAllSnakeVisionCones: false,
    visionCone: { halfAngle: Math.PI / 3, range: 128, cellFill: "rgba(120, 220, 255, 0.04)", visibleGoalStroke: "rgba(255, 220, 80, 0.35)", lineWidth: 1 },
    /** Explore waypoints must be at least this many grid tiles away (Chebyshev). */
    exploreMinTiles: 8,
    /** Fraction of explore repicks that target a nav-walkable belt cell in the rail maze. */
    beltExploreChance: 0.7,
    /** Min Chebyshev distance for belt explore picks (can be shorter than exploreMinTiles). */
    beltExploreMinTiles: 4,
    /** Fraction of food orbs spawned on belt cells when reachable. */
    beltFoodSpawnChance: 0.35,
    /** LRU grid-cell memory window per snake (vision + arrival stamps). */
    spatialMemoryCapacity: 128,
    /** Oldest memory fraction treated as explore frontier when no fresh cells exist. */
    spatialMemoryFringeRatio: 0.25,
    /** Extra local/HPA step cost on recently remembered cells (newest = full penalty). */
    navMemoryStepPenalty: 6,
    navMemoryStepFalloff: 0.65,
    /** When no cell meets exploreMinTiles, retry with this minimum distance. */
    exploreFallbackMinTiles: 1,
    /** Min Chebyshev distance when teleporting an eaten goal to a new cell (fallback if none). */
    goalRelocateMinTiles: 8,
    goalRelocateFallbackMinTiles: 1,
    showMemoryHeatmap: false,
    memoryHeatmap: { bucketCount: 8, fillRgb: "180, 100, 255", fillAlphaMax: 0.12, fillAlphaMin: 0.02 },
    /** Off-screen snakes run full FOV sync every N ticks (on-screen = every tick). */
    brainSyncOffScreenInterval: 4,
    /** Minimum chain segments to stay alive after split (head + 2 followers = 3). */
    minAliveSegmentCount: 3,
    /** Relative impact speed required to split a smaller snake at the struck segment. */
    splitImpulseThreshold: 35,
    /** Kinetic speed floor for striker snake cuts (shared with wallDamage.minStrikeSpeed). */
    kineticMinStrikeSpeed: SNAKE_KINETIC_MIN_STRIKE_SPEED,
    /**
     * Wall breakage — flat HP; height level is visual only.
     * minStrikeSpeed and referenceMaxSpeed are filled by resolveSnakeWallDamageConfig.
     * referenceMaxSpeed tracks striker drag-launch max; headMaxSpeed caps snake chip rate in practice.
     */
    wallDamage: { maxHp: 100, maxHitDamage: 45, minAngleFactor: 0.2 },
    /** Placed beside the center-start snake; drag-launch with at-rest gate. */
    strikerPropId: "snake_striker",
    /** Grid tiles to flee away from a visible larger snake (Chebyshev step). */
    fleeTiles: 8,
    /** Max world distance to react to a larger snake; null uses visionCone.range. */
    fleeRange: null,
    /** Milliseconds without food before a snake sheds one tail segment and shrinks. */
    starvationIntervalMs: 30_000,
    /** HUD FSM line + selected-snake world overlay for mode/dest/path debug. */
    showSnakeFsmDebug: false,
};
