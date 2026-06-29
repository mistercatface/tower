import { AgentIntentFSM, createExploreIntentState, createFleeIntentState, createSeekIntentState, createModePolicyLatch } from "../../AI/agentIntent/AgentIntent.js";
import { createAgentIntentMemory } from "../../AI/memory/createAgentIntentMemory.js";
import { deriveSprintIntent, buildAgentDecisionContextInto, buildAgentDecisionSpec, createAgentDecisionContextFrame } from "../../AI/agents/AgentDecisionContext.js";
import { publishAgentEngagement } from "../../AI/agents/AgentProfiles.js";
import { pickFleeCell } from "../../AI/steering/pickFleeCell.js";
import { pickCombatStrafeCell } from "../../AI/steering/pickCombatStrafeCell.js";
import { buildFlowTargetStepsInto, createFlowTargetStepSlots } from "../../Navigation/flowTargetSteps.js";
import { createFlowReachStaleCache } from "../../Navigation/flowReachStaleCache.js";
import { pickExploreDestination } from "../../Navigation/steering/exploreSteering.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { perceiveAgentWorldInto, resolveVisibleCategoryInVision } from "../../AI/perception/agentWorldPerception.js";
import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
import { AGENT_PROFILE } from "../../AI/agents/AgentProfiles.js";
import { resolveRelationshipForInstances } from "./agentRelationships.js";
import { isSnakeShardFood, isEdibleSnakeFoodForSeeker } from "./snakeFood.js";
import { getAgentHunger } from "./agentMetabolism.js";
import { createRangedCombatPolicyExtension, createRangedShootIntentState, resetInstanceRangedCombatAction } from "./rangedCombat.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
function readAgentRouteStatusInto(out, locomotion, agent, state) {
    const dest = locomotion.getDestination();
    const status = locomotion.getStatus(agent, state);
    const grid = state.obstacleGrid;
    out.hasDestination = !!dest;
    out.hasRoute = status.hasRoute;
    out.replanPending = status.replanPending;
    out.routeFailed = !!dest && locomotion.needsRetry(agent, state);
    out.destReached = !!dest && (locomotion.hasArrivedAtDest(agent, grid) || locomotion.hasReachedDest(agent, grid));
    out.stuckFrames = status.stuckFrames;
    out.pathLen = status.pathLen;
    return out;
}
function createBrainArrivalStamper(brain) {
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    return {
        stamp(agent, grid) {
            const col = grid.worldCol(agent.x);
            const row = grid.worldRow(agent.y);
            if (col === lastArrivalCol && row === lastArrivalRow) return;
            lastArrivalCol = col;
            lastArrivalRow = row;
            brain.stampArrival(col, row);
        },
        reset() {
            lastArrivalCol = null;
            lastArrivalRow = null;
        },
    };
}
function createFleeIntentLatch(config) {
    const fleeHysteresis = config.fleeHysteresis;
    return createModePolicyLatch({
        mode: "flee",
        minTicks: fleeHysteresis.minTicks,
        holdReason: "flee_hysteresis",
        refreshWhen: ({ world }) => {
            const threat = world.decisionContext.threatState;
            return threat?.lethal || threat?.severity >= fleeHysteresis.refreshAtSeverity;
        },
        canRelease: ({ world }) => {
            const threat = world.decisionContext.threatState;
            return !threat || (!threat.lethal && threat.severity <= fleeHysteresis.exitThreatSeverity);
        },
    });
}
function applyFleePolicyLatch({ world, fleeLatch, currentMode, sprintConfig, fleeHeldOn = "flee", policyOut }) {
    const ctx = world.decisionContext;
    const chosen = ctx.chosenIntent;
    const resolved = fleeLatch.apply(chosen, { world, currentMode });
    policyOut.mode = resolved.mode;
    policyOut.targetId = resolved.targetId ?? null;
    policyOut.reason = resolved.reason ?? null;
    if (resolved !== chosen) {
        if (fleeHeldOn === "any" || resolved.mode === "flee") ctx.events.push("FLEE_HELD");
        ctx.chosenIntent = resolved;
        ctx.chosenReason = resolved.reason ?? null;
        ctx.targetId = resolved.targetId ?? null;
        ctx.sprintIntent = deriveSprintIntent(resolved.mode, ctx, sprintConfig);
    }
    ctx.policyLatch = { flee: fleeLatch.snapshot() };
    return policyOut;
}
function augmentCellTargetIntentContext(ctx, { locomotion, resolveCommittedTarget }) {
    ctx.grid = ctx.state.obstacleGrid;
    ctx.dest = locomotion.getDestination();
    ctx.target = resolveCommittedTarget(ctx.targetId, ctx.world);
    ctx.fleeTarget = ctx.world.decisionContext.known.threat;
    ctx.locomotion = locomotion;
    return ctx;
}
const ACCEPT_PREDICATES = { edibleFood: isEdibleSnakeFoodForSeeker, ammoShard: (seeker, prop) => prop.type === "ammo_shard" && !prop.isDead };
const PACK_STEERING_SCRATCH = { packAnchor: { x: 0, y: 0 }, packBlend: 0, maxPackDistCells: 16 };
function buildVisibleSourceResolvers(profile) {
    if (!profile.visibleSources) return null;
    const resolvers = {};
    for (const [slotId, config] of Object.entries(profile.visibleSources)) {
        const accept = ACCEPT_PREDICATES[config.accept];
        if (!accept) throw new Error(`Unknown accept predicate: ${config.accept}`);
        const categoryId = config.category;
        resolvers[slotId] = (seeker, state, { frame, visionRange, committedTargetId, targetStickyFactor, vision }) => {
            const index = getPropCategoryIndex(state, categoryId);
            return resolveVisibleCategoryInVision(index, seeker, frame, visionRange, accept, committedTargetId, targetStickyFactor, vision);
        };
    }
    return resolvers;
}
function transitionReason(seekModes) {
    return (prevMode, nextMode, policy) => {
        if (policy?.reason) return policy.reason;
        if (nextMode === "flee") return "threat_visible";
        if (prevMode === "flee") return "threat_clear";
        if (nextMode === "shoot_enemy") return "enemy_in_range";
        if (prevMode === "shoot_enemy" && nextMode !== "shoot_enemy") return "shoot_complete";
        if (seekModes.includes(prevMode) && nextMode !== prevMode) return "target_lost";
        return `mode_${nextMode}`;
    };
}
function hasRangedShootMode(profile) {
    return !!profile.decision?.modes?.shoot_enemy;
}
function createIntentStates(huntMode, instance, profile, { locomotion, resolveExploreCell, brain, seekArrivalRadius, setFleeDestination, setCombatStrafeDestination }) {
    const seek = createSeekIntentState({ locomotion, seekArrivalRadius });
    const states = {
        explore: createExploreIntentState({ locomotion, resolveExploreCell, brain }),
        seek_food: seek,
        seek_ally: seek,
        flee: createFleeIntentState({ locomotion, setFleeDestination }),
        [huntMode]: seek,
    };
    if (hasRangedShootMode(profile) && instance.resolvedWeapon) states.shoot_enemy = createRangedShootIntentState(instance, () => instance.resolvedWeapon, { setCombatStrafeDestination });
    return states;
}
function resolveCommittedTarget(committedSlots, id, world) {
    if (id == null) return null;
    const known = world.decisionContext.known;
    for (let i = 0; i < committedSlots.length; i++) {
        const target = known[committedSlots[i]];
        if (target?.id === id) return target;
    }
    return null;
}
function buildSnakeDecisionContextInto(decisionContext, decisionSpec, input, agentCtx, resolveSegmentCount) {
    const { agent, state, visible, memoryWorld, committed, routeStatus, reachSteps } = input;
    const instance = agentCtx.instance;
    const profile = instance.profile;
    const decisionInput = {
        visibleWorld: visible,
        memoryWorld,
        memorySource: memoryWorld.memorySource,
        committedTarget: committed,
        routeStatus,
        reachSteps,
        cellSize: state.obstacleGrid.cellSize,
        shared: agentCtx.session.config.shared,
        foodFraction: getAgentHunger(instance.metabolism),
        combatStrafeMaxSpeed: instance.combatStrafeMaxSpeed ?? instance.walkMaxSpeed * 0.5,
        agentInstance: instance,
        instance: instance,
    };
    const fields = profile.intent.decisionFields ?? {};
    if (fields.seekerFaction) decisionInput.seekerFaction = agent.faction;
    if (fields.seekerSegmentCount) decisionInput.seekerSegmentCount = resolveSegmentCount ? resolveSegmentCount() : null;
    if (fields.session) decisionInput.session = state.sandbox.snakeGame;
    if (profile.weapon || hasRangedShootMode(profile)) {
        decisionInput.agent = agent;
        decisionInput.state = state;
        decisionInput.actionState = instance.combatAction;
        decisionInput.equippedWeapon = instance.equippedWeapon ?? null;
        decisionInput.weaponVisionRange = instance.visionRange.range;
    }
    return buildAgentDecisionContextInto(decisionContext, decisionSpec, decisionInput, { includeScoreDetails: false });
}
function defaultSeekArrivalRadius(profileId, profile, shared, instance) {
    const huntMode = profile.intent?.huntMode ?? "seek_prey";
    const terminalHoming = shared.terminalHoming;
    const headRadius = getCirclePropRadius(instance.head);
    return (mode, agent, target) => {
        if (mode === "seek_ally") {
            const cohesion = profile.factionCohesion ?? {};
            return { arrivalRadius: cohesion.arrivalRadius ?? (profileId === AGENT_PROFILE.snake ? 32 : 24), lockOnTarget: true, terminalHoming };
        }
        const huntArrival = Math.max(2, headRadius * 0.25);
        if (mode === huntMode || mode === "seek_prey" || mode === "seek_enemy" || mode === "shoot_enemy") return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
        if (target?.type !== "ammo_shard" && !isSnakeShardFood(target)) return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
        return { arrivalRadius: instance.eatRadius, lockOnTarget: true, terminalHoming };
    };
}
function setFleeDestination(intent, args, instance) {
    const { agent, state, world, avoidCell, locomotion, navWalkable, config, brain, resolveExploreCell } = args;
    const threat = world.decisionContext.known.threat;
    if (!threat) return null;
    const packOptions = intent.fleePackBlend ? resolvePackSteeringOptions(world.decisionContext, instance) : null;
    const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell, packOptions);
    if (cell) {
        locomotion.setFlee(agent, state, cell);
        return cell;
    }
    if (intent.fleeExploreFallback) {
        const exploreCell = resolveExploreCell(agent, state, brain.spatial, Math.random);
        if (exploreCell) locomotion.setExplore(agent, state, exploreCell);
        return exploreCell;
    }
    return null;
}
function setCombatStrafeDestination(args, instance) {
    const { agent, state, world, avoidCell, locomotion, navWalkable } = args;
    const combat = world.decisionContext.combatState;
    const enemy = combat?.visibleEnemy ?? combat?.enemy;
    if (!enemy || combat.tooClose || !combat.hasLineOfSight) return null;
    const weapon = instance.resolvedWeapon;
    if (!weapon) return null;
    const movement = weapon.combatMovement ?? {};
    const cell = pickCombatStrafeCell(
        agent,
        enemy,
        state.obstacleGrid,
        navWalkable,
        {
            strafeTiles: movement.strafeTiles ?? 3,
            idealRangeFraction: movement.idealRangeFraction ?? 0.65,
            rangeBandCells: movement.rangeBandCells ?? 2,
            orbitBias: movement.orbitBias ?? 0,
            fleeRange: weapon.fleeRange,
            maxRange: weapon.maxRange,
        },
        avoidCell,
    );
    if (cell) {
        locomotion.setFlee(agent, state, cell);
        return cell;
    }
    return null;
}
export function resolvePackSteeringOptions(ctx, instance) {
    const cohesion = instance.profile.factionCohesion ?? {};
    const packBlend = cohesion.fleePackBlend ?? 0;
    if (packBlend <= 0) return null;
    const known = ctx.known;
    if (!known || (known.allyCount ?? 0) < 1) return null;
    const centroid = known.allyCentroid;
    if (centroid) {
        PACK_STEERING_SCRATCH.packAnchor.x = centroid.x;
        PACK_STEERING_SCRATCH.packAnchor.y = centroid.y;
    } else if (known.ally) {
        PACK_STEERING_SCRATCH.packAnchor.x = known.ally.x;
        PACK_STEERING_SCRATCH.packAnchor.y = known.ally.y;
    } else return null;
    PACK_STEERING_SCRATCH.packBlend = packBlend;
    PACK_STEERING_SCRATCH.maxPackDistCells = cohesion.maxPackDistCells ?? 16;
    return PACK_STEERING_SCRATCH;
}
export function resolveSnakeExploreCell(seeker, state, memory, rng, navWalkable, shared) {
    const grid = state.obstacleGrid;
    const col = grid.worldCol(seeker.x);
    const row = grid.worldRow(seeker.y);
    const openCells = navWalkable.cells();
    const explorePick = { memory, openCells, rng };
    let cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: shared.exploreMinTiles });
    if (!cell && shared.exploreMinTiles > shared.exploreFallbackMinTiles) cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: shared.exploreFallbackMinTiles });
    if (!cell) {
        console.log("[snake] explore destination fell back to random walkable cell");
        cell = pickWalkableCell(openCells, { cols: grid.cols, rng });
    }
    if (cell && cell.col === col && cell.row === row) cell = pickWalkableCell(openCells, { cols: grid.cols, excludeIndices: new Set([colRowToIndex(col, row, grid.cols)]), rng });
    return cell;
}
export function buildGroundNavIntentAdapterOptions({ state, instance, brain, sync, headNav, agentCtx }) {
    const profile = instance.profile;
    const profileId = instance.profileId;
    const intent = profile.intent;
    const shared = agentCtx.session.config.shared;
    const navWalkable = agentCtx.navWalkable;
    const visibleSourceResolvers = buildVisibleSourceResolvers(profile);
    const resolveExploreCell = (seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, navWalkable, shared);
    const seekArrivalRadius = defaultSeekArrivalRadius(profileId, profile, shared, instance);
    const resolveSegmentCount = () => (state && instance ? getConnectedBodyIds(state.kinetic, instance.headId).length : 0);
    const decisionSpec = buildAgentDecisionSpec(profileId, profile);
    const decisionContext = createAgentDecisionContextFrame(profileId, decisionSpec.decisionSchema);
    const hasRangedShoot = hasRangedShootMode(profile);
    const intentMemoryOptions = intent.filterAllyForEngagement ? { ...shared.intentMemory, filterAllyForEngagement: true } : shared.intentMemory;
    const adapter = {
        brain,
        sync,
        headNav,
        agentCtx,
        instance,
        profile,
        intentConfig: intent,
        visionRange: instance.visionRange,
        visibleSourceResolvers,
        resolveExploreCell,
        seekArrivalRadius,
        resolveSegmentCount,
        reachSlots: intent.reachSlots,
        intentMemoryOptions,
        config: shared,
        decisionContext,
        buildDecisionContext: (input) => buildSnakeDecisionContextInto(decisionContext, decisionSpec, input, agentCtx, resolveSegmentCount),
        resolveCommittedTarget: (id, world) => resolveCommittedTarget(intent.committedSlots, id, world),
        setFleeDestination: (args) => setFleeDestination(intent, { ...args, navWalkable, config: shared, brain, resolveExploreCell }, instance),
        setCombatStrafeDestination: (args) => setCombatStrafeDestination({ ...args, navWalkable }, instance),
        sprintConfig: profile.sprint,
        fleeHeldOn: intent.fleeHeldOn,
        clearMemoryOnIntentClear: intent.clearMemoryOnIntentClear,
        transitionReason: transitionReason(intent.seekModes),
        policyExtensions: hasRangedShoot ? [createRangedCombatPolicyExtension()] : [],
        modeExitDelayTicks: hasRangedShoot ? { flee: 30, shoot_enemy: 15 } : { flee: 30 },
        onIntentClear: hasRangedShoot ? () => resetInstanceRangedCombatAction(instance) : null,
    };
    if (intent.publishEngagement)
        adapter.afterPerceive = (decisionContext, _agent, state) => {
            publishAgentEngagement(state.sandbox.snakeGame, instance.headId, decisionContext.engagementState);
        };
    return adapter;
}
export function createGroundNavIntentAdapter({
    brain,
    sync,
    headNav,
    instance,
    profile,
    intentConfig,
    visibleSourceResolvers,
    resolveExploreCell,
    agentCtx,
    visionRange,
    seekArrivalRadius,
    resolveSegmentCount = null,
    config,
    intentMemoryOptions,
    reachSlots,
    buildDecisionContext,
    decisionContext,
    afterPerceive = null,
    resolveCommittedTarget,
    setFleeDestination,
    setCombatStrafeDestination = null,
    sprintConfig,
    fleeHeldOn = "flee",
    clearMemoryOnIntentClear = false,
    onIntentClear = null,
    transitionReason,
    modeExitDelayTicks = { flee: 30 },
    policyExtensions = [],
}) {
    const resolvedVision = visionRange ?? config.visionRange;
    const locomotion = createCellTargetLocomotion(headNav);
    const intentMemory = createAgentIntentMemory(intentMemoryOptions);
    const fleeLatch = createFleeIntentLatch(config);
    const arrivalStamper = createBrainArrivalStamper(brain);
    const staleCache = createFlowReachStaleCache();
    const reachSlotList = createFlowTargetStepSlots(reachSlots);
    const visible = { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0 };
    const routeStatus = { hasDestination: false, hasRoute: false, replanPending: false, routeFailed: false, destReached: false, stuckFrames: 0, pathLen: null };
    const committed = { mode: null, targetId: null };
    const reachSteps = {};
    for (let i = 0; i < reachSlotList.length; i++) reachSteps[reachSlotList[i].key] = null;
    const flowReachContext = { state: null, agent: null, staleCache, range: config.decisionReachHorizon ?? 32, flowResult: { slot: null, steps: null, ready: false } };
    const perceiveWorld = { decisionContext };
    let intent = null;
    let lastDecisionContext = decisionContext;
    const policyScratch = { mode: null, targetId: null, reason: null };
    const perceptionOptions = {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: config.fleeRange ?? resolvedVision.range,
        resolveRelationship: resolveRelationshipForInstances,
        committedTargetId: null,
        targetStickyFactor: config.targetingHysteresis.targetStickyFactor ?? 0.75,
    };
    const intentContext = {
        agent: null,
        state: null,
        world: null,
        policy: policyScratch,
        mode: null,
        targetId: null,
        ticks: 0,
        lastModeChangeTick: 0,
        grid: null,
        dest: null,
        target: null,
        fleeTarget: null,
        locomotion: null,
        dtMs: 16,
    };
    const states = createIntentStates(intentConfig.huntMode, instance, profile, { locomotion, resolveExploreCell, brain, seekArrivalRadius, setFleeDestination, setCombatStrafeDestination });
    const perceiveWithMemory = (agent, state) => {
        perceptionOptions.committedTargetId = intent.getTargetId();
        perceiveAgentWorldInto(visible, agent, agentCtx, state, visibleSourceResolvers, resolvedVision, perceptionOptions);
        intentMemory.update(agent, state, visible);
        const memoryWorld = intentMemory.enrichWorld(state, visible);
        if (intent) {
            committed.mode = intent.getMode();
            committed.targetId = intent.getTargetId();
        } else {
            committed.mode = null;
            committed.targetId = null;
        }
        readAgentRouteStatusInto(routeStatus, locomotion, agent, state);
        flowReachContext.state = state;
        flowReachContext.agent = agent;
        buildFlowTargetStepsInto(reachSteps, memoryWorld, committed, routeStatus, reachSlotList, flowReachContext);
        buildDecisionContext({ agent, state, visible, memoryWorld, committed, routeStatus, reachSteps });
        afterPerceive?.(decisionContext, agent, state);
        lastDecisionContext = decisionContext;
        return perceiveWorld;
    };
    const resetArrivalAndLatch = () => {
        arrivalStamper.reset();
        fleeLatch.clear();
        for (let i = 0; i < policyExtensions.length; i++) policyExtensions[i].clear?.();
    };
    intent = new AgentIntentFSM({
        initialMode: "explore",
        sync(agent, state) {
            sync(agent, state);
            arrivalStamper.stamp(agent, state.obstacleGrid);
        },
        perceiveWorld: perceiveWithMemory,
        pickPolicy: (world) => {
            applyFleePolicyLatch({ world, fleeLatch, currentMode: intent?.getMode(), sprintConfig, fleeHeldOn, policyOut: policyScratch });
            for (let i = 0; i < policyExtensions.length; i++) policyExtensions[i].apply({ world, currentMode: intent?.getMode(), sprintConfig, policyIn: policyScratch, policyOut: policyScratch });
            return policyScratch;
        },
        transitionReason,
        states,
        modeExitDelayTicks,
        contextFrame: intentContext,
        augmentContext: (ctx) => augmentCellTargetIntentContext(ctx, { locomotion, resolveCommittedTarget }),
        onClear(agent, state) {
            resetArrivalAndLatch();
            if (clearMemoryOnIntentClear) intentMemory.clear();
            onIntentClear?.();
            locomotion.clear(agent, state);
            if (agent) agent.navStepPenalty = null;
        },
        onResetMode(agent, state) {
            resetArrivalAndLatch();
            locomotion.clearDestination(agent, state);
        },
        onTransition(agent, state) {
            locomotion.clearDestination(agent, state);
        },
    });
    const base = {
        ...intent,
        getMode: () => intent.getMode(),
        getTargetId: () => intent.getTargetId(),
        clearTargetId: () => intent.clearTargetId(),
        getLastTransitionReason: () => intent.getLastTransitionReason(),
        perceive: (agent, state) => intent.perceive(agent, state),
        transition: (agent, state) => intent.transition(agent, state),
        headId: agentCtx.instance.headId,
        sprintWanted: false,
        tick(agent, state, dtMs = 16) {
            intentContext.dtMs = dtMs;
            intent.perceive(agent, state);
            const choice = intent.transition(agent, state);
            const currentMode = intent.getMode();
            if (currentMode !== "shoot_enemy" && agentCtx.instance.combatAction) {
                const action = agentCtx.instance.combatAction;
                if (action.phase === "reloading") {
                    action.timerMs = Math.max(0, action.timerMs - dtMs);
                    if (action.timerMs <= 0) resetInstanceRangedCombatAction(agentCtx.instance);
                } else if (action.phase === "reacting" || action.phase === "fire_delay") resetInstanceRangedCombatAction(agentCtx.instance);
            }
            base.sprintWanted = lastDecisionContext.sprintIntent.want === true;
            return choice;
        },
        getDestination() {
            return locomotion.getDestination();
        },
        getDecisionContext() {
            return lastDecisionContext;
        },
        resetMemory() {
            brain.clearMemory();
            intentMemory.clear();
        },
        clear(agent, state) {
            intent.clear(agent, state);
            intentMemory.clear();
        },
        clearTrackedGoal() {
            const id = intent.getTargetId();
            intent.clearTargetId();
            if (id != null) intentMemory.clearTarget(id);
        },
        resetMode() {
            intent.resetMode(null, null);
        },
        hasMoveTarget() {
            return locomotion.hasMoveTarget(null, null);
        },
    };
    return base;
}
