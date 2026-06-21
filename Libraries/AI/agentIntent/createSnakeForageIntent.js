import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { perceiveSnakeIntentWorld, pickFleeCell, pickSnakeIntentPolicy } from "../../Game/snake/snakeIntent.js";
import { createSnakeIntentMemory } from "../../Game/snake/snakeIntentMemory.js";
import { createAgentIntent, createExploreIntentState, createFleeIntentState, createSeekIntentState } from "./createAgentIntent.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
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
    const perceiveWithMemory = (agent, state) => {
        const visible = perceiveSnakeIntentWorld(agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        intentMemory.update(agent, state, visible);
        return intentMemory.enrichWorld(state, visible);
    };
    const intent = createAgentIntent({
        brain,
        sync,
        perceiveWorld: perceiveWithMemory,
        pickPolicy: (world) => {
            const policy = pickSnakeIntentPolicy(world);
            if (policy.mode === "flee" && world.memorySource?.threat) policy.reason = "threat_memory";
            else if (policy.mode === "seek_prey" && world.memorySource?.prey) policy.reason = "prey_memory";
            else if (policy.mode === "seek_food" && world.memorySource?.food) policy.reason = "food_memory";
            return policy;
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
        rng,
        resolveCommitTarget: (state, id, world) => {
            if (world?.prey?.id === id) return world.prey;
            if (world?.food?.id === id) return world.food;
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
            return { ...intent.getFsmSnapshot(agent, state), intentMemory: intentMemory.snapshot() };
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
