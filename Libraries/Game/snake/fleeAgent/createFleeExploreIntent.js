import { createAgentIntent } from "../../../AI/agentIntent/createAgentIntent.js";
import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../../AI/agentIntent/intentStates.js";
import { createModePolicyLatch } from "../../../AI/agentIntent/policyHysteresis.js";
import { pickFleeCell } from "../../../AI/steering/pickFleeCell.js";
import { resolveFleePackOptions } from "./resolveFleePackOptions.js";
import { createCellTargetLocomotion } from "../../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { perceiveFleeAgentWorld } from "./fleeWorldPerception.js";
import { requireSnakeVisionFrame } from "../snakePerception.js";
import { resolveAgentRelationship } from "../snakeAgentSession.js";
import { buildFleeDecisionContext, deriveFleeSprintIntent } from "./fleeDecisionModel.js";
import { createAgentIntentMemory } from "../../../AI/memory/createAgentIntentMemory.js";
import { syncNavReachHorizon, navReachStepsTo } from "../../../Navigation/navReachHorizon.js";
export function createFleeExploreIntent({
    brain,
    sync,
    headNav,
    resolveVisibleFood,
    resolveExploreCell,
    selfHeadId,
    registry,
    navWalkable,
    visionRange = null,
    seekArrivalRadius = null,
    resolveHunger = null,
    rng = Math.random,
}) {
    const config = getSnakeGameConfig();
    const resolvedVision = visionRange ?? config.visionRange;
    const locomotion = createCellTargetLocomotion(headNav);
    const fleeHysteresis = config.fleeHysteresis;
    const intentMemory = createAgentIntentMemory(config.intentMemory);
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
    let intent = null;
    let lastBlackboard = null;
    let lastDecisionSnapshot = null;
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    const stampArrivalOnCellEnter = (agent, grid) => {
        const col = grid.worldCol(agent.x);
        const row = grid.worldRow(agent.y);
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
        if (known.food?.id === id) return known.food;
        if (known.enemy?.id === id) return known.enemy;
        if (known.ally?.id === id) return known.ally;
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
        const nav = requireSnakeVisionFrame(state).navTopology;
        syncNavReachHorizon(nav, agent.x, agent.y, config.decisionReachHorizon ?? 32);
        const committed = intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null;
        const routeStatus = readRouteStatus(agent, state);
        function reachStepsForMode(target, mode) {
            if (!target) return null;
            if (committed?.mode === mode && committed.targetId === target.id) {
                const pathLen = routeStatus?.pathLen;
                if (Number.isFinite(pathLen)) return pathLen;
            }
            return navReachStepsTo(target.x, target.y);
        }
        const reachSteps = {
            threat: reachStepsForMode(memoryWorld.threat, "flee"),
            enemy: reachStepsForMode(memoryWorld.prey, "seek_enemy"),
            food: reachStepsForMode(memoryWorld.food, "seek_food"),
            ally: reachStepsForMode(memoryWorld.ally, "seek_ally"),
        };
        const decisionContext = buildFleeDecisionContext({
            visibleWorld: memoryWorld,
            memoryWorld,
            memorySource: memoryWorld.memorySource,
            committedTarget: committed,
            routeStatus,
            reachSteps,
            cellSize: state.obstacleGrid.cellSize,
            foodFraction: resolveHunger ? resolveHunger() : null,
        });
        lastBlackboard = decisionContext.blackboard;
        lastDecisionSnapshot = decisionContext.decisionSnapshot;
        return { ...memoryWorld, blackboard: decisionContext.blackboard, decisionSnapshot: decisionContext.decisionSnapshot };
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
            const packOptions = resolveFleePackOptions(world.blackboard);
            const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell, packOptions);
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
        const target = resolveCommittedTarget(ctx.targetId, ctx.world);
        return { ...ctx, grid: ctx.state.obstacleGrid, dest: locomotion.getDestination(), target, fleeTarget: ctx.world.blackboard.facts.known.threat, locomotion };
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
            if (policy !== world.decisionSnapshot.chosenIntent && policy.mode === "flee") world.blackboard.events.push("FLEE_HELD");
            if (policy.mode !== world.decisionSnapshot.chosenIntent.mode || policy.reason !== world.decisionSnapshot.chosenIntent.reason) {
                world.decisionSnapshot.events = world.blackboard.events;
                world.decisionSnapshot.chosenIntent = policy;
                world.decisionSnapshot.chosenReason = policy.reason ?? null;
                world.decisionSnapshot.targetId = policy.targetId ?? null;
                world.decisionSnapshot.sprintIntent = deriveFleeSprintIntent(policy.mode, world.decisionSnapshot.threatState, world.decisionSnapshot.hungerState);
            }
            world.decisionSnapshot.policyLatch = { flee: fleeLatch.snapshot() };
            lastDecisionSnapshot = world.decisionSnapshot;
            return policy;
        },
        transitionReason: (prevMode, nextMode, policy) => {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if ((prevMode === "seek_enemy" || prevMode === "seek_food") && nextMode !== prevMode) return "target_lost";
            if (prevMode === "seek_ally" && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        states: { explore: createExploreIntentState(), seek_enemy: createSeekIntentState(), seek_food: createSeekIntentState(), seek_ally: createSeekIntentState(), flee: createFleeIntentState() },
        modeExitDelayTicks: { flee: 30 },
        createEffects: createFleeEffects,
        createContext: createFleeContext,
        onClear(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            fleeLatch.clear();
            intentMemory.clear();
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
