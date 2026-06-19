/** Snake autosim gameplay defaults — spacing/eat radius derived from prop radii at runtime. */
export const SNAKE_GAME_DEFAULTS = {
    segmentPropId: "ball",
    headPropId: "snake_head",
    goalPropId: "goal_orb",
    snakeCount: 30,
    goalCount: 100,
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
    cavern: { mapSeedOffset: 11, wallHeightLevel: 1, regionPaddingCells: 4, fillChance: 0.48, iterations: 4, openBoundaryRows: 3 },
    rail: { generator: "bspMaze", wallHeightLevel: 1, edgeThickness: 1, roomSizeMin: 5, roomSizeMax: 12, roomMargin: 1, corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 },
    showVisionCones: true,
    showAllSnakeVisionCones: false,
    visionCone: { halfAngle: Math.PI / 3, range: 128, cellFill: "rgba(120, 220, 255, 0.04)", visibleGoalStroke: "rgba(255, 220, 80, 0.35)", lineWidth: 1 },
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
    memoryHeatmap: { bucketCount: 8, fillRgb: "180, 100, 255", fillAlphaMax: 0.12, fillAlphaMin: 0.02 },
    /** Off-screen snakes run full FOV sync every N ticks (on-screen = every tick). */
    brainSyncOffScreenInterval: 4,
    /** Minimum chain segments to stay alive after split (head + 2 followers = 3). */
    minAliveSegmentCount: 3,
    /** Relative impact speed required to split a smaller snake at the struck segment. */
    splitImpulseThreshold: 35,
    /** When true and snakeGame registry exists, snakes hunt smaller heads and flee larger ones. */
    predatorPreyEnabled: true,
    /** Visible prey must have size score below self × this ratio (1 = strictly smaller). */
    preySizeRatio: 1,
    /** Utility weight for prey vs food when both are visible (0–1). */
    huntPriority: 0.55,
    /** Max distance to react to a larger snake with flee (world units); null uses visionCone.range. */
    fleeRange: null,
    /** HPA flee waypoint distance away from the threat (world units). */
    fleeMinDistance: 96,
    /** Seconds without food before a snake sheds one tail segment and shrinks. */
    starvationIntervalSec: 30,
    showKineticSolverStats: false,
    /** Optional vision cone override for the player snake only; null uses visionCone. */
    playerVisionCone: null,
};
