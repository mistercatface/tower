import { createAgentIntent } from "../../../AI/agentIntent/createAgentIntent.js";
import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../../AI/agentIntent/intentStates.js";
import { createModePolicyLatch } from "../../../AI/agentIntent/policyHysteresis.js";
import { pickFleeCell } from "../../../AI/steering/pickFleeCell.js";
import { createCellTargetLocomotion } from "../../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { perceiveFleeAgentWorld } from "./fleeWorldPerception.js";
import { requireSnakeVisionFrame } from "../snakePerception.js";
import { resolveAgentRelationship } from "../snakeAgentSession.js";
import { buildFleeDecisionContext, deriveFleeSprintIntent } from "./fleeDecisionModel.js";
import { createFleeIntentMemory } from "./fleeIntentMemory.js";
import { resolveFleeHuntStrikeTarget } from "./fleeHuntTargeting.js";
export function createFleeExploreIntent({
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
    rng = Math.random,
}) {
    const config = getSnakeGameConfig();
    const resolvedVision = visionCone ?? config.visionCone;
    const locomotion = createCellTargetLocomotion(headNav);
    const fleeHysteresis = config.fleeHysteresis;
    const intentMemory = createFleeIntentMemory(config.intentMemory);
    const fleeLatch = createModePolicyLatch({
        mode: "flee",
        minTicks: fleeHysteresis.minTicks,
        holdReason: "flee_hysteresis",
        refreshWhen: ({ world }) => {
            const threat = world.blackboard?.facts?.threatState ?? world.decisionSnapshot?.threatState;
            return threat?.lethal || threat?.severity >= fleeHysteresis.refreshAtSeverity;
        },
        canRelease: ({ world }) => {
            const threat = world.blackboard?.facts?.threatState ?? world.decisionSnapshot?.threatState;
            return !threat || (!threat.lethal && threat.severity <= fleeHysteresis.exitThreatSeverity);
        },
    });
    const huntHysteresis = config.fleeAgent.huntHysteresis ?? { minTicks: 45 };
    const huntLatch = createModePolicyLatch({
        mode: "hunt",
        minTicks: huntHysteresis.minTicks,
        holdReason: "hunt_hysteresis",
        refreshWhen: ({ world }) => !!world.blackboard?.facts?.known?.prey,
        canRelease: ({ world }) => !world.blackboard?.facts?.known?.prey,
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
    const resolveCommittedTarget = (id, world) => {
        if (id == null) return null;
        const known = world.blackboard.facts.known;
        if (known.prey?.id === id) return known.prey;
        if (known.food?.id === id) return known.food;
        return null;
    };
    const perceiveWithMemory = (agent, state) => {
        const visible = perceiveFleeAgentWorld(agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision, {
            readVisionFrame: requireSnakeVisionFrame,
            agentRange: config.fleeRange ?? resolvedVision.range,
            resolveRelationship: (selfHeadId, headId, state) => resolveAgentRelationship(state.sandbox.snakeGame, selfHeadId, headId, state),
        });
        intentMemory.update(agent, state, visible);
        const memoryWorld = intentMemory.enrichWorld(state, visible);
        const decisionContext = buildFleeDecisionContext({
            visibleWorld: memoryWorld,
            memoryWorld,
            memorySource: memoryWorld.memorySource,
            committedTarget: intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null,
            routeStatus: readRouteStatus(agent, state),
            foodFraction: resolveHunger ? resolveHunger() : null,
        });
        lastBlackboard = decisionContext.blackboard;
        lastDecisionSnapshot = decisionContext.decisionSnapshot;
        return { ...memoryWorld, blackboard: decisionContext.blackboard, decisionSnapshot: decisionContext.decisionSnapshot };
    };
    const resolveSeekTarget = (mode, agent, state, target, preyHeadId) => {
        if (mode === "hunt" && preyHeadId != null) return resolveFleeHuntStrikeTarget(agent, preyHeadId, state) ?? target;
        return target;
    };
    const createFleeEffects = ({ agent, state, mode, world, targetId }) => ({
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
            const seekTarget = resolveSeekTarget(mode, agent, state, target, targetId);
            const seekOptions = typeof seekArrivalRadius === "function" ? seekArrivalRadius(mode, agent, seekTarget, state) : seekArrivalRadius;
            const options = typeof seekOptions === "object" && seekOptions !== null ? seekOptions : { arrivalRadius: seekOptions };
            locomotion.setSeek(agent, state, seekTarget, { ...options, targetId });
        },
        updateSeekTarget(target) {
            const seekTarget = resolveSeekTarget(mode, agent, state, target, targetId);
            if (!seekTarget) return;
            locomotion.updateSeekTarget(agent, state, seekTarget, { targetId });
        },
        setFleeDestination(avoidCell = null) {
            const threat = world.blackboard.facts.known.threat;
            if (!threat) return null;
            const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell);
            if (cell) {
                locomotion.setFlee(agent, state, cell);
                return cell;
            }
            const exploreCell = resolveExploreCell(agent, state, brain.spatial, rng);
            if (exploreCell) locomotion.setExplore(agent, state, exploreCell);
            return exploreCell;
        },
    });
    const createFleeContext = (ctx) => {
        const committed = resolveCommittedTarget(ctx.targetId, ctx.world);
        const target = resolveSeekTarget(ctx.mode, ctx.agent, ctx.state, committed, ctx.targetId);
        return {
            ...ctx,
            grid: ctx.state.obstacleGrid,
            dest: locomotion.getDestination(),
            target,
            fleeTarget: ctx.world.blackboard.facts.known.threat,
            locomotion,
        };
    };
    intent = createAgentIntent({
        initialMode: "explore",
        sync(agent, state) {
            sync(agent, state);
            stampArrivalOnCellEnter(agent, state.obstacleGrid);
        },
        perceiveWorld: perceiveWithMemory,
        pickPolicy: (world) => {
            let policy = world.decisionSnapshot.chosenIntent;
            policy = fleeLatch.apply(policy, { world, currentMode: intent.getMode() });
            if (policy !== world.decisionSnapshot.chosenIntent && policy.mode === "flee") {
                world.blackboard.events.push("FLEE_HELD");
            }
            policy = huntLatch.apply(policy, { world, currentMode: intent.getMode() });
            if (policy !== world.decisionSnapshot.chosenIntent && policy.mode === "hunt") {
                world.blackboard.events.push("HUNT_HELD");
            }
            if (policy.mode === "hunt" && policy.targetId == null) {
                const preyId = intent.getTargetId() ?? world.blackboard?.facts?.known?.prey?.id ?? world.decisionSnapshot.chosenIntent.targetId;
                if (preyId != null) policy = { ...policy, targetId: preyId };
            }
            if (policy.mode !== world.decisionSnapshot.chosenIntent.mode || policy.reason !== world.decisionSnapshot.chosenIntent.reason) {
                world.decisionSnapshot.events = world.blackboard.events;
                world.decisionSnapshot.chosenIntent = policy;
                world.decisionSnapshot.chosenReason = policy.reason ?? null;
                world.decisionSnapshot.targetId = policy.targetId ?? null;
                world.decisionSnapshot.sprintIntent = deriveFleeSprintIntent(policy.mode, world.decisionSnapshot.threatState, world.decisionSnapshot.hungerState);
            }
            world.decisionSnapshot.policyLatch = { flee: fleeLatch.snapshot(), hunt: huntLatch.snapshot() };
            lastDecisionSnapshot = world.decisionSnapshot;
            return policy;
        },
        transitionReason: (prevMode, nextMode, policy) => {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if ((prevMode === "seek_food" || prevMode === "hunt") && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        states: { explore: createExploreIntentState(), seek_food: createSeekIntentState(), hunt: createSeekIntentState(), flee: createFleeIntentState() },
        modeExitDelayTicks: { flee: 30, hunt: 30 },
        createEffects: createFleeEffects,
        createContext: createFleeContext,
        onClear(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            fleeLatch.clear();
            huntLatch.clear();
            intentMemory.clear();
            locomotion.clear(agent, state);
            if (agent) agent.navStepPenalty = null;
        },
        onResetMode(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            fleeLatch.clear();
            huntLatch.clear();
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
        getDecisionSnapshot() {
            return lastDecisionSnapshot;
        },
        resetMemory() {
            brain.clearMemory();
            intentMemory.clear();
        },
        clearTrackedGoal() {
            const id = intent.getTargetId();
            intent.clearTargetId();
            if (id != null) intentMemory.clearTarget(id);
        },
        tick(agent, state) {
            intent.perceive(agent, state);
            return intent.transition(agent, state);
        },
        clearIntent(agent, state) {
            intent.clear(agent, state);
            intentMemory.clear();
        },
    };
}
