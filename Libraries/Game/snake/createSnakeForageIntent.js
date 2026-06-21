import { createAgentIntent, createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../AI/agentIntent/createAgentIntent.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { createSnakeDecisionBlackboard, perceiveSnakeIntentWorld, pickFleeCell, pickSnakeIntentPolicy } from "./snakeIntent.js";
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
    rng = Math.random,
}) {
    const config = getSnakeGameConfig();
    const resolvedVision = visionCone ?? config.visionCone;
    const intentMemory = createSnakeIntentMemory(config.intentMemory);
    const locomotion = createCellTargetLocomotion(headNav);
    let intent = null;
    let lastBlackboard = null;
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
        const blackboard = createSnakeDecisionBlackboard({
            visibleWorld: visible,
            memoryWorld,
            memorySource: memoryWorld.memorySource,
            committedTarget: intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null,
            routeStatus: readRouteStatus(agent, state),
        });
        lastBlackboard = blackboard;
        return { blackboard, events: blackboard.events };
    };
    intent = createAgentIntent({
        brain,
        sync,
        perceiveWorld: perceiveWithMemory,
        pickPolicy: (world) => {
            return pickSnakeIntentPolicy(world.blackboard);
        },
        transitionReason: (prevMode, nextMode, policy) => {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if ((prevMode === "seek_food" || prevMode === "seek_prey") && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        resolveExploreCell,
        resolveFleeCell: (agent, threat, state, avoidCell) => pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, undefined, avoidCell),
        locomotion,
        seekMode: "seek_food",
        seekModes: ["seek_food", "seek_prey"],
        fleeMode: "flee",
        exploreMode: "explore",
        seekArrivalRadius,
        states: { explore: createExploreIntentState(), seek_food: createSeekIntentState(), seek_prey: createSeekIntentState(), flee: createFleeIntentState() },
        modeExitDelayTicks: { flee: 30 },
        resolveFleeTarget: (world) => world.blackboard.facts.known.threat,
        rng,
        resolveCommitTarget: (state, id, world) => {
            const known = world.blackboard.facts.known;
            if (known.prey?.id === id) return known.prey;
            if (known.food?.id === id) return known.food;
            return null;
        },
    });
    return {
        ...intent,
        headNav,
        getIntentMemorySnapshot() {
            return intentMemory.snapshot();
        },
        getFsmSnapshot(agent, state) {
            return { ...intent.getFsmSnapshot(agent, state), intentMemory: intentMemory.snapshot(), intentEvents: lastBlackboard?.events ?? [] };
        },
        resetMemory() {
            intent.resetMemory();
            intentMemory.clear();
        },
        clear(agent, state) {
            intent.clear(agent, state);
            intentMemory.clear();
        },
        clearTrackedGoal() {
            const id = intent.getTrackedGoalId();
            intent.clearTrackedGoal();
            if (id != null) intentMemory.clearTarget(id);
        },
        resetMode() {
            intent.resetMode(null, null);
        },
        hasMoveTarget() {
            return intent.hasMoveTarget(null, null);
        },
    };
}
