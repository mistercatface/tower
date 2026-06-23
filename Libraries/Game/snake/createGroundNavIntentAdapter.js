import { createAgentIntent } from "../../AI/agentIntent/createAgentIntent.js";
import { createModePolicyLatch } from "../../AI/agentIntent/policyHysteresis.js";
import { createAgentIntentMemory } from "../../AI/memory/createAgentIntentMemory.js";
import { syncNavReachHorizon } from "../../Navigation/navReachHorizon.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { buildAgentReachSteps } from "./agentReachSteps.js";
import { perceiveAgentIntentWorld } from "./agentIntentPerception.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
function readAgentRouteStatus(locomotion, agent, state) {
    const dest = locomotion.getDestination();
    const status = locomotion.getStatus(agent, state);
    const grid = state.obstacleGrid;
    return {
        hasDestination: !!dest,
        hasRoute: status.hasRoute,
        replanPending: status.replanPending,
        routeFailed: !!dest && locomotion.needsRetry(agent, state),
        destReached: !!dest && (locomotion.hasArrivedAtDest(agent, grid) || locomotion.hasReachedDest(agent, grid)),
        stuckFrames: status.stuckFrames,
        pathLen: status.pathLen,
    };
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
function readThreatState(world) {
    return world.blackboard?.facts?.threatState ?? world.decisionSnapshot?.threatState;
}
function createFleeIntentLatch(config) {
    const fleeHysteresis = config.fleeHysteresis;
    return createModePolicyLatch({
        mode: "flee",
        minTicks: fleeHysteresis.minTicks,
        holdReason: "flee_hysteresis",
        refreshWhen: ({ world }) => {
            const threat = readThreatState(world);
            return threat?.lethal || threat?.severity >= fleeHysteresis.refreshAtSeverity;
        },
        canRelease: ({ world }) => {
            const threat = readThreatState(world);
            return !threat || (!threat.lethal && threat.severity <= fleeHysteresis.exitThreatSeverity);
        },
    });
}
function applyFleePolicyLatch({ world, fleeLatch, currentMode, deriveSprintIntent, fleeHeldOn = "flee" }) {
    const chosen = world.decisionSnapshot.chosenIntent;
    const policy = fleeLatch.apply(chosen, { world, currentMode });
    if (policy !== chosen) {
        if (fleeHeldOn === "any" || policy.mode === "flee") world.blackboard.events.push("FLEE_HELD");
        world.decisionSnapshot.events = world.blackboard.events;
        world.decisionSnapshot.chosenIntent = policy;
        world.decisionSnapshot.chosenReason = policy.reason ?? null;
        world.decisionSnapshot.targetId = policy.targetId ?? null;
        world.decisionSnapshot.sprintIntent = deriveSprintIntent(policy.mode, world.decisionSnapshot);
    }
    world.decisionSnapshot.policyLatch = { flee: fleeLatch.snapshot() };
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
        fleeTarget: ctx.world.blackboard.facts.known.threat,
        locomotion,
    });
}
export function getGroundNavFsmSnapshot({ intent, locomotion, agent, state, intentMemory, lastBlackboard, lastDecisionSnapshot }) {
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
        intentEvents: lastBlackboard?.events ?? [],
        decision: lastDecisionSnapshot,
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
    formatPerceiveWorld = (decisionContext) => decisionContext,
    afterPerceive = null,
    resolveCommittedTarget,
    setFleeDestination,
    deriveSprintIntent,
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
    let intent = null;
    let lastBlackboard = null;
    let lastDecisionSnapshot = null;
    const perceiveWithMemory = (agent, state) => {
        const visible = perceiveAgentIntentWorld(agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        intentMemory.update(agent, state, visible);
        const memoryWorld = intentMemory.enrichWorld(state, visible);
        const nav = requireSnakeVisionFrame(state).navTopology;
        syncNavReachHorizon(nav, agent.x, agent.y, config.decisionReachHorizon ?? 32);
        const committed = intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null;
        const routeStatus = readAgentRouteStatus(locomotion, agent, state);
        const reachSteps = buildAgentReachSteps(memoryWorld, committed, routeStatus, reachSlots);
        const decisionContext = buildDecisionContext({ agent, state, visible, memoryWorld, committed, routeStatus, reachSteps });
        afterPerceive?.(decisionContext, agent, state);
        lastBlackboard = decisionContext.blackboard;
        lastDecisionSnapshot = decisionContext.decisionSnapshot;
        return formatPerceiveWorld(decisionContext, memoryWorld);
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
        pickPolicy: (world) => applyFleePolicyLatch({ world, fleeLatch, currentMode: intent?.getMode(), deriveSprintIntent, fleeHeldOn }),
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
        getDecisionSnapshot() {
            return lastDecisionSnapshot;
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
    return { ...base, ...extendReturn({ intent, locomotion, intentMemory, getLastBlackboard: () => lastBlackboard, getLastDecisionSnapshot: () => lastDecisionSnapshot }) };
}
