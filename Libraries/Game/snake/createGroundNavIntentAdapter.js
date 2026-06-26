import { createAgentIntent } from "../../AI/agentIntent/createAgentIntent.js";
import { createModePolicyLatch } from "../../AI/agentIntent/policyHysteresis.js";
import { createAgentIntentMemory } from "../../AI/memory/createAgentIntentMemory.js";
import { deriveSprintIntent } from "../../AI/agents/deriveSprintIntent.js";
import { buildFlowTargetStepsInto, createFlowTargetStepSlots } from "../../Navigation/flowTargetSteps.js";
import { createFlowReachStaleCache } from "../../Navigation/flowReachStaleCache.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { perceiveAgentWorldInto } from "../../AI/perception/agentWorldPerception.js";
import { resolveAgentPerceptionOptions } from "./agentIntentPerception.js";
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
function createStableCellTargetIntentEffects({ locomotion, resolveExploreCell, brain, rng, seekArrivalRadius, setFleeDestination, getContext, seekOptionsScratch }) {
    return {
        clearDestination() {
            const ctx = getContext();
            locomotion.clearDestination(ctx.agent, ctx.state);
        },
        setExploreDestination() {
            const ctx = getContext();
            const cell = resolveExploreCell(ctx.agent, ctx.state, brain.spatial, rng);
            if (cell) locomotion.setExplore(ctx.agent, ctx.state, cell);
            return cell;
        },
        setSeekDestination(target) {
            const ctx = getContext();
            if (!target) return;
            const seekOptions = typeof seekArrivalRadius === "function" ? seekArrivalRadius(ctx.mode, ctx.agent, target, ctx.state) : seekArrivalRadius;
            if (typeof seekOptions === "object" && seekOptions !== null) {
                seekOptionsScratch.arrivalRadius = seekOptions.arrivalRadius;
                seekOptionsScratch.lockOnTarget = seekOptions.lockOnTarget;
                seekOptionsScratch.terminalHoming = seekOptions.terminalHoming;
            } else {
                seekOptionsScratch.arrivalRadius = seekOptions;
                seekOptionsScratch.lockOnTarget = undefined;
                seekOptionsScratch.terminalHoming = undefined;
            }
            seekOptionsScratch.targetId = ctx.targetId;
            locomotion.setSeek(ctx.agent, ctx.state, target, seekOptionsScratch);
        },
        updateSeekTarget(target) {
            const ctx = getContext();
            if (!target) return;
            locomotion.updateSeekTarget(ctx.agent, ctx.state, target, { targetId: ctx.targetId });
        },
        setFleeDestination(avoidCell = null) {
            const ctx = getContext();
            return setFleeDestination({ agent: ctx.agent, state: ctx.state, world: ctx.world, avoidCell, locomotion });
        },
    };
}
function augmentCellTargetIntentContext(ctx, { locomotion, resolveCommittedTarget }) {
    ctx.grid = ctx.state.obstacleGrid;
    ctx.dest = locomotion.getDestination();
    ctx.target = resolveCommittedTarget(ctx.targetId, ctx.world);
    ctx.fleeTarget = ctx.world.decisionContext.known.threat;
    ctx.locomotion = locomotion;
    return ctx;
}
export function getGroundNavFsmSnapshot({ intent, locomotion, agent, state, intentMemory, lastDecisionContext }) {
    const loco = locomotion.getStatus(agent, state);
    const dest = locomotion.getDestination();
    let replanReason = null;
    if (loco.lastReplanReason) replanReason = loco.lastReplanReason;
    else if (loco.replanPending) replanReason = "pending";
    else if (dest && !loco.hasRoute) replanReason = "no_route";
    return {
        mode: intent.getMode(),
        destCell: dest ? { col: dest.col, row: dest.row } : null,
        pathLen: loco.pathLen,
        replanReason,
        navPhase: loco.navPhase,
        routeGoal: loco.routeGoal,
        terminalGoal: loco.terminalGoal,
        routeCommitFrames: loco.routeCommitFrames,
        routeId: loco.routeId,
        lastAcceptedRouteReason: loco.lastAcceptedRouteReason,
        lastAcceptedPathLen: loco.lastAcceptedPathLen,
        lastAcceptedProgressIdx: loco.lastAcceptedProgressIdx,
        lastAcceptedTarget: loco.lastAcceptedTargetX == null || loco.lastAcceptedTargetY == null ? null : { x: loco.lastAcceptedTargetX, y: loco.lastAcceptedTargetY },
        targetDistance: loco.targetDistance,
        targetLos: loco.targetLos,
        stuckFrames: loco.stuckFrames,
        vx: agent.vx,
        vy: agent.vy,
        lastTransition: intent.getLastTransitionReason(),
        intentMemory: intentMemory.snapshot(),
        intentEvents: lastDecisionContext?.events ?? [],
        decision: lastDecisionContext,
    };
}
export function createGroundNavIntentAdapter({
    brain,
    sync,
    headNav,
    visibleSourceResolvers,
    resolveExploreCell,
    agentCtx,
    visionRange,
    seekArrivalRadius,
    resolveHunger,
    resolveSegmentCount = null,
    rng = Math.random,
    config,
    intentMemoryOptions,
    reachSlots,
    buildDecisionContext,
    decisionContext,
    afterPerceive = null,
    resolveCommittedTarget,
    setFleeDestination,
    sprintConfig,
    fleeHeldOn = "flee",
    clearMemoryOnIntentClear = false,
    onIntentClear = null,
    transitionReason,
    states,
    modeExitDelayTicks = { flee: 30 },
    policyExtensions = [],
    extendReturn = () => ({}),
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
    const seekOptionsScratch = { arrivalRadius: 0, lockOnTarget: undefined, terminalHoming: undefined, targetId: null };
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
        effects: null,
        dtMs: 16,
    };
    const cellTargetEffects = createStableCellTargetIntentEffects({
        locomotion,
        resolveExploreCell,
        brain,
        rng,
        seekArrivalRadius,
        setFleeDestination,
        getContext: () => intentContext,
        seekOptionsScratch,
    });
    intentContext.effects = cellTargetEffects;
    const perceiveWithMemory = (agent, state) => {
        perceiveAgentWorldInto(visible, agent, agentCtx, state, visibleSourceResolvers, resolvedVision, resolveAgentPerceptionOptions(resolvedVision, config, agentCtx));
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
    intent = createAgentIntent({
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
        effects: cellTargetEffects,
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
    });
    const base = {
        ...intent,
        headId: agentCtx.instance.headId,
        headNav,
        getDestination() {
            return locomotion.getDestination();
        },
        getDecisionContext() {
            return lastDecisionContext;
        },
        getIntentMemorySnapshot() {
            return intentMemory.snapshot();
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
    return {
        ...base,
        ...extendReturn({
            intent,
            locomotion,
            intentMemory,
            getLastDecisionContext: () => lastDecisionContext,
            setTickDt: (dtMs) => {
                intentContext.dtMs = dtMs;
            },
        }),
    };
}
