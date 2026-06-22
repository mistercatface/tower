import { createAgentIntent } from "../../AI/agentIntent/createAgentIntent.js";
import { createModePolicyLatch } from "../../AI/agentIntent/policyHysteresis.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { buildSnakeDecisionContext, deriveSprintIntent } from "./snakeDecisionModel.js";
import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../AI/agentIntent/intentStates.js";
import { pickFleeCell } from "../../AI/steering/pickFleeCell.js";
import { perceiveAgentWorld } from "../../AI/perception/agentWorldPerception.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { createSnakeIntentMemory } from "./snakeIntentMemory.js";
export function createSnakeForageIntent({
    brain,
    sync,
    headNav,
    resolveVisibleFood,
    resolveExploreCell,
    selfHeadId,
    registry,
    navWalkable,
    visionCone = null,
    seekArrivalRadius = null,
    resolveHunger = null,
    resolveSegmentCount = null,
    rng = Math.random,
}) {
    const config = getSnakeGameConfig();
    const resolvedVision = visionCone ?? config.visionCone;
    const intentMemory = createSnakeIntentMemory(config.intentMemory);
    const locomotion = createCellTargetLocomotion(headNav);
    const fleeHysteresis = config.fleeHysteresis;
    const fleeLatch = createModePolicyLatch({
        mode: "flee",
        minTicks: fleeHysteresis.minTicks,
        holdReason: "flee_hysteresis",
        refreshWhen: ({ world }) => {
            const threat = world.blackboard.facts.threatState;
            return threat?.lethal || threat?.severity >= fleeHysteresis.refreshAtSeverity;
        },
        canRelease: ({ world }) => {
            const threat = world.blackboard.facts.threatState;
            return !threat || (!threat.lethal && threat.severity <= fleeHysteresis.exitThreatSeverity);
        },
    });
    let intent = null;
    let lastBlackboard = null;
    let lastDecisionSnapshot = null;
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    const stampArrivalOnCellEnter = (agent, grid) => {
        const { col, row } = grid.worldToGrid(agent.x, agent.y);
        if (col === lastArrivalCol && row === lastArrivalRow) return;
        lastArrivalCol = col;
        lastArrivalRow = row;
        brain.stampArrival(col, row);
    };
    const readRouteStatus = (agent, state) => {
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
    };
    const perceiveWithMemory = (agent, state) => {
        const visible = perceiveAgentWorld(agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision, {
            readVisionFrame: requireSnakeVisionFrame,
            agentRange: config.fleeRange ?? resolvedVision.range,
            resolveRelationship: (selfHeadId, headId, state) => resolveAgentRelationship(state.sandbox.snakeGame, selfHeadId, headId, state),
        });
        intentMemory.update(agent, state, visible);
        const memoryWorld = intentMemory.enrichWorld(state, visible);
        const decisionContext = buildSnakeDecisionContext({
            visibleWorld: visible,
            memoryWorld,
            memorySource: memoryWorld.memorySource,
            committedTarget: intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null,
            routeStatus: readRouteStatus(agent, state),
            foodFraction: resolveHunger ? resolveHunger() : null,
            seekerFaction: agent.faction,
            seekerSegmentCount: resolveSegmentCount ? resolveSegmentCount() : null,
        });
        lastBlackboard = decisionContext.blackboard;
        lastDecisionSnapshot = decisionContext.decisionSnapshot;
        return decisionContext;
    };
    const resolveCommittedTarget = (id, world) => {
        if (id == null) return null;
        const known = world.blackboard.facts.known;
        if (known.prey?.id === id) return known.prey;
        if (known.food?.id === id) return known.food;
        if (known.ally?.id === id) return known.ally;
        return null;
    };
    const createSnakeEffects = ({ agent, state, mode, world, targetId }) => ({
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
            const threat = world.blackboard.facts.known.threat;
            if (!threat) return null;
            const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell);
            if (cell) locomotion.setFlee(agent, state, cell);
            return cell;
        },
    });
    const createSnakeContext = (ctx) => ({
        ...ctx,
        grid: ctx.state.obstacleGrid,
        dest: locomotion.getDestination(),
        target: resolveCommittedTarget(ctx.targetId, ctx.world),
        fleeTarget: ctx.world.blackboard.facts.known.threat,
        locomotion,
    });
    intent = createAgentIntent({
        initialMode: "explore",
        sync(agent, state) {
            sync(agent, state);
            stampArrivalOnCellEnter(agent, state.obstacleGrid);
        },
        perceiveWorld: perceiveWithMemory,
        pickPolicy: (world) => {
            const policy = world.decisionSnapshot.chosenIntent;
            const latched = fleeLatch.apply(policy, { world, currentMode: intent?.getMode() });
            if (latched !== policy) {
                world.blackboard.events.push("FLEE_HELD");
                world.decisionSnapshot.events = world.blackboard.events;
                world.decisionSnapshot.chosenIntent = latched;
                world.decisionSnapshot.chosenReason = latched.reason ?? null;
                world.decisionSnapshot.targetId = latched.targetId ?? null;
                world.decisionSnapshot.sprintIntent = deriveSprintIntent(latched.mode, world.decisionSnapshot.threatState);
            }
            world.decisionSnapshot.policyLatch = { flee: fleeLatch.snapshot() };
            return latched;
        },
        transitionReason: (prevMode, nextMode, policy) => {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if ((prevMode === "seek_food" || prevMode === "seek_prey" || prevMode === "seek_ally") && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        states: { explore: createExploreIntentState(), seek_food: createSeekIntentState(), seek_prey: createSeekIntentState(), seek_ally: createSeekIntentState(), flee: createFleeIntentState() },
        modeExitDelayTicks: { flee: 30 },
        createEffects: createSnakeEffects,
        createContext: createSnakeContext,
        onClear(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            fleeLatch.clear();
            locomotion.clear(agent, state);
            if (agent) agent.navStepPenalty = null;
        },
        onResetMode(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            fleeLatch.clear();
            locomotion.clearDestination(agent, state);
        },
    });
    return {
        ...intent,
        headId: selfHeadId,
        headNav,
        getDestination() {
            return locomotion.getDestination();
        },
        getIntentMemorySnapshot() {
            return intentMemory.snapshot();
        },
        getDecisionSnapshot() {
            return lastDecisionSnapshot;
        },
        getFsmSnapshot(agent, state) {
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
}
