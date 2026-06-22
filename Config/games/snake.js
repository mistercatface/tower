/** Minimum pre-impact speed for kinetic wall chips and striker snake cuts. */
export const SNAKE_KINETIC_MIN_STRIKE_SPEED = 28;
/** Snake autosim gameplay defaults — spacing/eat radius derived from prop radii at runtime. */
export const SNAKE_GAME_DEFAULTS = {
    segmentPropId: "ball",
    headPropId: "snake_head",
    snakeCount: 64,
    segmentCount: 3,
    /** Center-to-center rest length = segment diameter × linkSlack. */
    linkSlack: 1.05,
    bodyPressureNudgeWeight: 0.5,
    bodyPressureSpeedDamp: 2.0,
    eatMargin: 2,
    foodPickupRadius: 2,
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
    startRadius: 2,
    cavern: { mapSeedOffset: 11, wallHeightLevel: 1, regionPaddingCells: 4, fillChance: 0.48, iterations: 4, openBoundaryRows: 3 },
    rail: { wallHeightLevel: 1, edgeThickness: 1, corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 },
    showVisionCones: false,
    showAllSnakeVisionCones: false,
    visionCone: { halfAngle: Math.PI / 3, range: 128, cellFill: "rgba(120, 220, 255, 0.04)", visibleGoalStroke: "rgba(255, 220, 80, 0.35)", lineWidth: 1 },
    /** Explore waypoints must be at least this many grid tiles away (Chebyshev). */
    exploreMinTiles: 8,
    /** LRU grid-cell memory window per snake (vision + arrival stamps). */
    spatialMemoryCapacity: 128,
    /** Extra local/HPA step cost on recently remembered cells (newest = full penalty). */
    navMemoryStepPenalty: 6,
    navMemoryStepFalloff: 0.65,
    /** When no cell meets exploreMinTiles, retry with this minimum distance. */
    exploreFallbackMinTiles: 1,
    showMemoryHeatmap: false,
    memoryHeatmap: { bucketCount: 8, fillRgb: "180, 100, 255", fillAlphaMax: 0.12, fillAlphaMin: 0.02 },
    /** Off-screen snakes run full FOV sync every N ticks (on-screen = every tick). */
    brainSyncOffScreenInterval: 4,
    /** Minimum chain segments to stay alive after split (head + 2 followers = 3). */
    minAliveSegmentCount: 3,
    /** Hard cap on length; overfeeding past this is wasted. */
    maxAliveSegmentCount: 12,
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
    /** Within this world distance a larger threat always forces flee, regardless of hunger. */
    lethalThreatRange: 48,
    /** Flee has separate enter/exit thresholds so snakes do not yo-yo around threat vision. */
    fleeHysteresis: { minTicks: 45, exitThreatSeverity: 0.15, refreshAtSeverity: 0.35 },
    /** Short-term intent memory after LOS loss, in FSM ticks. */
    intentMemory: { threatTtlTicks: 45, preyTtlTicks: 90, foodTtlTicks: 180 },
    /** Locked seek targets switch from HPA pathing to direct steering once close and visible. */
    terminalHoming: { enabled: true, handoffRadius: null, requireWorldLos: true, minHoldTicks: 6 },
    /**
     * Metabolism — hunger and size are two separate meters.
     * hungerDrainMs: time to drain the hunger bar from full (1) to empty (0) at normal speed.
     * foodValue: hunger restored per food orb; overflow past full spills into growth.
     * growthCost: overflow hunger units needed to build one new segment (overfeeding grows you).
     * starveShedIntervalMs: once hunger is empty, time spent starving before losing each segment.
     */
    metabolism: { hungerDrainMs: 30_000, foodValue: 0.5, growthCost: 1.0, starveShedIntervalMs: 10_000 },
    /** Hunger-bar cutoffs for the satisfied/hungry/desperate facts (1 = just ate, 0 = starving). */
    hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 },
    /** Decision scoring base weights. Shard food is safer than live prey, with threat and route pressure layered on top. */
    decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 },
    /**
     * Hunger/route pressure layered on top of the base weights.
     * foodHungerBonus scales the food score by how empty the food timer is.
     * preyDesperationBonus pushes a desperate snake to hunt smaller snakes when
     * food is unknown or its route recently failed.
     */
    decisionPressure: {
        foodHungerBonus: 300,
        preyDesperationBonus: 250,
        /** How much a snake discounts a (non-lethal) threat by hunger when scoring flee. 0 = always flee. */
        riskTolerance: { satisfied: 0, hungry: 0.4, desperate: 0.75 },
        effort: { costPerCell: { satisfied: 25, hungry: 20, desperate: 6 }, preyValue: { satisfied: 140, hungry: 300, desperate: 550 } },
    },
    /**
     * Sprint = burn hunger faster to move faster. Stamina IS hunger: sprinting drains the
     * food timer faster and sheds tail segments faster, so a snake can sprint until it hits
     * minAliveSegmentCount — a min-length snake has no tail left to burn and can never sprint.
     * fleeSeverity is the threat severity at or above which a fleeing snake sprints to escape.
     * speed/accel multipliers scale the head's ground nav while sprinting; hungerDrainMultiplier
     * advances the food timer faster so sprinting eats into hunger and accelerates shedding.
     */
    sprint: { fleeSeverity: 0.5, speedMultiplier: 1.4, accelMultiplier: 1.4, hungerDrainMultiplier: 2.5 },
    /** HUD FSM line + selected-snake world overlay for mode/dest/path debug. */
    showSnakeFsmDebug: false,
};
