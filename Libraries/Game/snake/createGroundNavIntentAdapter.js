import { createAgentIntent } from "../../AI/agentIntent/createAgentIntent.js";
import { createModePolicyLatch } from "../../AI/agentIntent/policyHysteresis.js";
import { createAgentIntentMemory } from "../../AI/memory/createAgentIntentMemory.js";
import { deriveSprintIntent } from "../../AI/agents/deriveSprintIntent.js";
import { syncNavReachHorizon } from "../../Navigation/navReachHorizon.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { buildAgentReachStepsInto } from "./agentReachSteps.js";
import { perceiveAgentIntentWorldInto } from "./agentIntentPerception.js";
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
function applyFleePolicyLatch({ world, fleeLatch, currentMode, sprintConfig, fleeHeldOn = "flee" }) {
    const ctx = world.decisionContext;
    const chosen = ctx.chosenIntent;
    const policy = fleeLatch.apply(chosen, { world, currentMode });
    if (policy !== chosen) {
        if (fleeHeldOn === "any" || policy.mode === "flee") ctx.events.push("FLEE_HELD");
        ctx.chosenIntent = policy;
        ctx.chosenReason = policy.reason ?? null;
        ctx.targetId = policy.targetId ?? null;
        ctx.sprintIntent = deriveSprintIntent(policy.mode, ctx, sprintConfig);
    }
    ctx.policyLatch = { flee: fleeLatch.snapshot() };
    return policy;
}
function createCellTargetIntentEffects({ locomotion, resolveExploreCell, brain, rng, seekArrivalRadius, setFleeDestination }) {
    return ({ agent, state, mode, world, targetId }) => ({
        clearDestination() {
            locomotion.clearDestination(agent, state);
        },
        setExploreDestination() {
            const cell = resolveExploreCell(agent, state, brain.spatial, rng);
            if (cell) locomotion.setExplore(agent, state, cell);
            return cell;
        },
        setSeekDestination(target) {
            if (!target) return;
            const seekOptions = typeof seekArrivalRadius === "function" ? seekArrivalRadius(mode, agent, target, state) : seekArrivalRadius;
            const options = typeof seekOptions === "object" && seekOptions !== null ? seekOptions : { arrivalRadius: seekOptions };
            locomotion.setSeek(agent, state, target, { ...options, targetId });
        },
        updateSeekTarget(target) {
            if (!target) return;
            locomotion.updateSeekTarget(agent, state, target, { targetId });
        },
        setFleeDestination(avoidCell = null) {
            return setFleeDestination({ agent, state, world, avoidCell, locomotion });
        },
    });
}
function createCellTargetIntentContext({ locomotion, resolveCommittedTarget }) {
    return (ctx) => ({
        ...ctx,
        grid: ctx.state.obstacleGrid,
        dest: locomotion.getDestination(),
        target: resolveCommittedTarget(ctx.targetId, ctx.world),
        fleeTarget: ctx.world.decisionContext.known.threat,
        locomotion,
    });
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
    resolveVisibleFood,
    resolveExploreCell,
    selfHeadId,
    registry,
    navWalkable,
    visionRange,
    seekArrivalRadius,
    resolveHunger,
    resolveSegmentCount = null,
    rng = Math.random,
    config,
    intentMemoryOptions,
    reachSlots,
    buildDecisionContext,
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
    extendReturn = () => ({}),
}) {
    const resolvedVision = visionRange ?? config.visionRange;
    const locomotion = createCellTargetLocomotion(headNav);
    const intentMemory = createAgentIntentMemory(intentMemoryOptions);
    const fleeLatch = createFleeIntentLatch(config);
    const arrivalStamper = createBrainArrivalStamper(brain);
    const visible = { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0 };
    const routeStatus = { hasDestination: false, hasRoute: false, replanPending: false, routeFailed: false, destReached: false, stuckFrames: 0, pathLen: null };
    const committed = { mode: null, targetId: null };
    const reachSteps = Object.fromEntries(Object.keys(reachSlots).map((key) => [key, null]));
    const perceiveWorld = { decisionContext: null };
    let intent = null;
    let lastDecisionContext = null;
    const perceiveWithMemory = (agent, state) => {
        perceiveAgentIntentWorldInto(visible, agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        intentMemory.update(agent, state, visible);
        const memoryWorld = intentMemory.enrichWorld(state, visible);
        const nav = requireSnakeVisionFrame(state).navTopology;
        syncNavReachHorizon(nav, agent.x, agent.y, config.decisionReachHorizon ?? 32);
        if (intent) {
            committed.mode = intent.getMode();
            committed.targetId = intent.getTargetId();
        } else {
            committed.mode = null;
            committed.targetId = null;
        }
        readAgentRouteStatusInto(routeStatus, locomotion, agent, state);
        buildAgentReachStepsInto(reachSteps, memoryWorld, committed, routeStatus, reachSlots);
        const decisionContext = buildDecisionContext({ agent, state, visible, memoryWorld, committed, routeStatus, reachSteps });
        afterPerceive?.(decisionContext, agent, state);
        lastDecisionContext = decisionContext;
        perceiveWorld.decisionContext = decisionContext;
        return perceiveWorld;
    };
    const resetArrivalAndLatch = () => {
        arrivalStamper.reset();
        fleeLatch.clear();
    };
    intent = createAgentIntent({
        initialMode: "explore",
        sync(agent, state) {
            sync(agent, state);
            arrivalStamper.stamp(agent, state.obstacleGrid);
        },
        perceiveWorld: perceiveWithMemory,
        pickPolicy: (world) => applyFleePolicyLatch({ world, fleeLatch, currentMode: intent?.getMode(), sprintConfig, fleeHeldOn }),
        transitionReason,
        states,
        modeExitDelayTicks,
        createEffects: createCellTargetIntentEffects({ locomotion, resolveExploreCell, brain, rng, seekArrivalRadius, setFleeDestination }),
        createContext: createCellTargetIntentContext({ locomotion, resolveCommittedTarget }),
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
        headId: selfHeadId,
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
    return { ...base, ...extendReturn({ intent, locomotion, intentMemory, getLastDecisionContext: () => lastDecisionContext }) };
}
