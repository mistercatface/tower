import { createAgentIntent } from "../../AI/agentIntent/createAgentIntent.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { buildSnakeDecisionContext } from "./snakeDecisionModel.js";
import { perceiveSnakeIntentWorld, pickFleeCell } from "./snakeIntent.js";
import { createSnakeIntentMemory } from "./snakeIntentMemory.js";
import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "./snakeIntentStates.js";
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
    rng = Math.random,
}) {
    const config = getSnakeGameConfig();
    const resolvedVision = visionCone ?? config.visionCone;
    const intentMemory = createSnakeIntentMemory(config.intentMemory);
    const locomotion = createCellTargetLocomotion(headNav);
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
        const visible = perceiveSnakeIntentWorld(agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        intentMemory.update(agent, state, visible);
        const memoryWorld = intentMemory.enrichWorld(state, visible);
        const decisionContext = buildSnakeDecisionContext({
            visibleWorld: visible,
            memoryWorld,
            memorySource: memoryWorld.memorySource,
            committedTarget: intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null,
            routeStatus: readRouteStatus(agent, state),
            foodFraction: resolveHunger ? resolveHunger() : null,
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
        return null;
    };
    const createSnakeEffects = ({ agent, state, mode, world }) => ({
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
            locomotion.setSeek(agent, state, target, typeof seekOptions === "object" && seekOptions !== null ? seekOptions : { arrivalRadius: seekOptions });
        },
        setFleeDestination(avoidCell = null) {
            const threat = world.blackboard.facts.known.threat;
            if (!threat) return null;
            const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, undefined, avoidCell);
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
            return world.decisionSnapshot.chosenIntent;
        },
        transitionReason: (prevMode, nextMode, policy) => {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if ((prevMode === "seek_food" || prevMode === "seek_prey") && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        states: { explore: createExploreIntentState(), seek_food: createSeekIntentState(), seek_prey: createSeekIntentState(), flee: createFleeIntentState() },
        modeExitDelayTicks: { flee: 30 },
        createEffects: createSnakeEffects,
        createContext: createSnakeContext,
        onClear(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            locomotion.clear(agent, state);
            if (agent) agent.navStepPenalty = null;
        },
        onResetMode(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            locomotion.clearDestination(agent, state);
        },
    });
    return {
        ...intent,
        headNav,
        getDestination() {
            return locomotion.getDestination();
        },
        getIntentMemorySnapshot() {
            return intentMemory.snapshot();
        },
        getFsmSnapshot(agent, state) {
            const loco = locomotion.getStatus(agent, state);
            const dest = locomotion.getDestination();
            let replanReason = null;
            if (loco.replanPending) replanReason = "pending";
            else if (dest && !loco.hasRoute) replanReason = "no_route";
            return {
                mode: intent.getMode(),
                destCell: dest ? { col: dest.col, row: dest.row } : null,
                pathLen: loco.pathLen,
                replanReason,
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
