/** Minimum pre-impact speed for kinetic wall chips and snake splits. */
export const SNAKE_KINETIC_MIN_STRIKE_SPEED = 28;
/** Snake autosim gameplay defaults — spacing/eat radius derived from prop radii at runtime. */
export const SNAKE_GAME_DEFAULTS = {
    segmentPropId: "ball",
    headPropId: "snake_head",
    snakeCount: 48,
    /** Rolling ball flee agents spawned after snakes (0 disables). */
    boidCount: 256,
    fleeAgent: {
        bodyPropId: "flee_ball",
        faction: "bravo",
        teams: [
            { faction: "charlie", color: "#f1c40f" },
            { faction: "delta", color: "#2ecc71" },
        ],
        /** Roll top speed; null uses global groundNavRoll.maxSpeed (180). */
        maxSpeed: 100,
        /** Roll thrust; null uses global groundNavRoll.accel (600). */
        accel: 200,
        /** Kinetic friction; null keeps flee_ball asset default. */
        friction: null,
        initialHunger: 0.85,
        metabolism: { hungerDrainMs: 90_000, foodValue: 0.35 },
        hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 },
        sprint: { fleeSeverity: 0.5, speedMultiplier: 1.75, accelMultiplier: 1.5, hungerDrainMultiplier: 2.0, sprintFleeMinHunger: 0.1 },
        decisionWeights: { flee: 400, enemy: 420, food: 360, seek_ally: 280, explore: 100 },
        /** Same-faction flee ball regroup when safe (seek_ally mode). */
        factionCohesion: { arrivalRadius: 24, idealStopDist: 2.5, packBonus: 20, satisfiedBonus: 60, fleePackBlend: 0.35, maxPackDistCells: 16 },
        decisionPressure: {
            foodHungerBonus: 280,
            sprintFleeMinHunger: 0.1,
            outnumberedFleeBonus: 0.4,
            sprintFoodCostPenalty: 40,
            riskTolerance: { satisfied: 0, hungry: 0.35, desperate: 0.65 },
            effort: { costPerCell: { satisfied: 22, hungry: 18, desperate: 8 } },
        },
        decision: {
            scoreOrder: ["flee", "seek_enemy", "seek_food", "seek_ally", "explore"],
            targetLost: { seek_enemy: "enemy", seek_food: "food", seek_ally: "ally" },
            remembered: [{ key: "threat" }, { key: "enemy", memoryKey: "prey" }, { key: "food" }, { key: "ally" }, { key: "allyCount", allyCount: 1 }, { key: "allyCentroid", constant: null }],
            eventTargets: ["threat", "food", "enemy", "ally"],
            slots: { threat: {}, enemy: { visibleFrom: "prey", memoryKey: "prey", hideVisibleWhenMemory: true, known: "visibleOrRemembered" }, food: {}, ally: { hideVisibleWhenMemory: true } },
            fields: {
                threatCount: { visible: { from: "threatCount", default: 0 }, known: { fromVisible: "threatCount", default: 0 } },
                allyCount: { visible: { from: "allyCount", default: 0, ifMemory: { key: "ally", use: 0 } }, known: { visibleIfSlot: "ally", fromVisible: "allyCount", fromRemembered: "allyCount" } },
                allyCentroid: { visible: { from: "allyCentroid", default: null, ifMemory: { key: "ally", use: null } }, known: { fromVisible: "allyCentroid" } },
            },
            modes: {
                flee: { scorer: "riskAdjustedFlee", mods: ["outnumberedFlee"] },
                seek_enemy: { scorer: "reachTarget", slot: "enemy", weightKey: "enemy", guards: ["noThreat"] },
                seek_food: { scorer: "foodWithHunger", slot: "food", guards: ["notSatisfied"] },
                seek_ally: { scorer: "regroupAlly", slot: "ally", cohesion: "flee", guards: ["noThreat", "notDesperate"] },
                explore: { scorer: "constant", weightKey: "explore" },
            },
        },
    },
    segmentCount: 3,
    /** Center-to-center rest length = segment diameter × linkSlack. */
    linkSlack: 1.0,
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
    rail: { wallHeightLevel: 1, edgeThickness: 4, corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 },
    /** When true, camera-focused agent draws vision, spatial memory, and path debug overlays. */
    showFocusedAgentDebug: false,
    focusedAgentDebug: { vision: true, spatialMemory: true, path: true, agentSlots: {}, pathPreview: { cellCount: 3 }, targetRing: {} },
    visionRange: { range: 128, cellFill: "rgba(120, 220, 255, 0.04)", visibleGoalStroke: "rgba(255, 220, 80, 0.35)", lineWidth: 1 },
    /** Max nav path steps for sync decision reach BFS (see Plans/current/fsm/fsmbfs.md). */
    decisionReachHorizon: 32,
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
    /** Kinetic speed floor for snake splits and wall chips (shared with wallDamage.minStrikeSpeed). */
    kineticMinStrikeSpeed: SNAKE_KINETIC_MIN_STRIKE_SPEED,
    /** Wall breakage — flat HP; height level is visual only. minStrikeSpeed filled by resolveSnakeWallDamageConfig. */
    wallDamage: { maxHp: 100, maxHitDamage: 45, minAngleFactor: 0.2, referenceMaxSpeed: 560 },
    /** Grid tiles to flee away from a visible larger snake (Chebyshev step). */
    fleeTiles: 8,
    /** Max world distance to react to a larger snake; null uses visionRange.range. */
    fleeRange: null,
    /** Within this world distance a larger threat always forces flee, regardless of hunger. */
    lethalThreatRange: 48,
    /** Flee has separate enter/exit thresholds so snakes do not yo-yo around threat vision. */
    fleeHysteresis: { minTicks: 45, exitThreatSeverity: 0.15, refreshAtSeverity: 0.35 },
    /** Short-term intent memory after LOS loss, in FSM ticks. */
    intentMemory: { threatTtlTicks: 45, preyTtlTicks: 90, foodTtlTicks: 180, allyTtlTicks: 60 },
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
    /** Opposite-faction snakes within this segment gap duel (both hunt) instead of hunt/flee. */
    rivalBand: { maxSegmentGap: 2 },
    /** Decision scoring base weights. Shard food is safer than live prey, with threat and route pressure layered on top. */
    decisionWeights: { flee: 400, prey: 300, food: 340, seek_ally: 220, explore: 100 },
    /** Same-faction snake regroup when satisfied and safe (seek_ally mode). Scales down with segment count. */
    factionCohesion: { arrivalRadius: 32, idealStopDist: 3, packBonus: 15, satisfiedBonus: 50, referenceSegmentCount: 3, maxSegmentScale: 10 },
    /**
     * Hunger/route pressure layered on top of the base weights.
     * foodHungerBonus scales the food score by how empty the food timer is.
     * preyDesperationBonus pushes a desperate snake to hunt smaller snakes when
     * food is unknown or its route recently failed.
     */
    decisionPressure: {
        foodHungerBonus: 300,
        preyDesperationBonus: 250,
        /** Flat seek_prey score for visible enemy snake targets (prey or rival). */
        enemySnakePreyValue: 1300,
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
    decision: {
        scoreOrder: ["flee", "seek_prey", "seek_food", "seek_ally", "explore"],
        targetLost: { seek_prey: "prey", seek_food: "food", seek_ally: "ally" },
        remembered: [{ key: "threat" }, { key: "prey" }, { key: "food" }, { key: "ally" }, { key: "allyCount", allyCount: 1 }, { key: "allyCentroid", constant: null }],
        eventTargets: ["threat", "prey", "food", "ally"],
        slots: { threat: {}, prey: {}, food: {}, ally: { known: "engagedAlly" } },
        fields: {
            allyCount: { visible: { from: "allyCount", default: 0 }, known: { anchorSlot: "ally", matchWorldSlot: "ally", fromVisible: "allyCount", fromRemembered: "allyCount", whenMissing: 0 } },
            allyCentroid: {
                visible: { from: "allyCentroid", default: null },
                known: { anchorSlot: "ally", matchWorldSlot: "ally", fromVisible: "allyCentroid", whenMissing: null, whenNoMatch: null },
            },
        },
        modes: {
            flee: { scorer: "riskAdjustedFlee" },
            seek_prey: { scorer: "preyWithEffort", slot: "prey" },
            seek_food: { scorer: "foodWithHunger", slot: "food" },
            seek_ally: { scorer: "regroupAlly", slot: "ally", cohesion: "snake", guards: ["requiresLeadworthy", "requiresSatisfied", "noThreat"] },
            explore: { scorer: "constant", weightKey: "explore" },
        },
    },
};
