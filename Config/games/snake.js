/** Snake autosim gameplay defaults — spacing/eat radius derived from prop radii at runtime. */
export const SNAKE_GAME_DEFAULTS = {
    segmentPropId: "ball",
    headPropId: "snake_head",
    goalPropId: "goal_orb",
    snakeCount: 30,
    goalCount: 75,
    playerSnakeIndex: 0,
    segmentCount: 3,
    /** Center-to-center rest length = segment diameter × linkSlack. */
    linkSlack: 1.05,
    eatMargin: 2,
    growDirX: -1,
    growDirY: 0,
    /** Optional cap on head roll speed; null uses global groundNavRoll.maxSpeed. */
    headMaxSpeed: 140,
    hudHighScoreStorageKey: "snakeHighScore",
    startRadius: 2,
    maxRadius: 4,
    radiusPerMeal: 0.25,
    cavern: { mapSeedOffset: 11, wallHeightLevel: 1 },
    showVisionCones: true,
    showAllSnakeVisionCones: false,
    visionCone: { halfAngle: Math.PI / 3, range: 128, stroke: "rgba(120, 220, 255, 0.85)", visibleGoalStroke: "rgba(255, 220, 80, 0.95)", lineWidth: 1 },
    /** Explore waypoints must be at least this many grid tiles away (Chebyshev). */
    exploreMinTiles: 8,
    /** LRU grid-cell memory window per snake (vision + arrival stamps). */
    spatialMemoryCapacity: 128,
    /** Oldest memory fraction treated as explore frontier when no fresh cells exist. */
    spatialMemoryFringeRatio: 0.25,
    /** Extra local/HPA step cost on recently remembered cells (newest = full penalty). */
    navMemoryStepPenalty: 6,
    navMemoryStepFalloff: 0.65,
    /** When no cell meets exploreMinTiles, retry with this minimum distance. */
    exploreFallbackMinTiles: 1,
    showMemoryHeatmap: true,
    memoryHeatmap: { bucketCount: 8, fillRgb: "180, 100, 255", fillAlphaMax: 0.28, fillAlphaMin: 0.05, strokeAlphaMax: 0.7, strokeAlphaMin: 0.15, lineWidth: 1 },
    /** Off-screen snakes run full FOV sync every N ticks (on-screen = every tick). */
    brainSyncOffScreenInterval: 4,
    showKineticSolverStats: false,
    /** Optional vision cone override for the player snake only; null uses visionCone. */
    playerVisionCone: null,
};
