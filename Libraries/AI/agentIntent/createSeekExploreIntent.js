import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Sandbox/groundNav/groundNavIds.js";
import { createAgentIntent } from "./createAgentIntent.js";
import { createBehaviorGroundLocomotion } from "./behaviorGroundLocomotion.js";
export function createSeekExploreIntent({
    brain,
    sync: brainSync,
    behaviorById,
    setActiveBehaviorId,
    resolveVisibleGoal,
    resolveExploreCell,
    navBehaviorId = HPA_GROUND_NAV_BEHAVIOR_ID,
    directBehaviorId = DIRECT_GROUND_NAV_BEHAVIOR_ID,
    rng = Math.random,
}) {
    const locomotion = createBehaviorGroundLocomotion(behaviorById, setActiveBehaviorId, navBehaviorId, directBehaviorId);
    const intent = createAgentIntent({
        brain,
        sync() {},
        perceiveWorld(agent, state) {
            return { goal: resolveVisibleGoal(agent, state) };
        },
        pickPolicy(world) {
            if (world.goal) return { mode: "seek", targetId: world.goal.id };
            return { mode: "explore", targetId: null };
        },
        transitionReason(prevMode, nextMode) {
            if (prevMode === "seek" && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        resolveExploreCell,
        resolveCommitTarget(_state, id, world) {
            if (world.goal && world.goal.id === id) return world.goal;
            return null;
        },
        locomotion,
        seekMode: "seek",
        exploreMode: "explore",
        rng,
    });
    return {
        sync(agent, state) {
            brainSync(agent, state);
        },
        refresh: intent.refresh,
        enterSeek(agent, goal, state) {
            intent.holdSeek(agent, state, goal);
        },
        enterExplore(agent, state) {
            intent.holdExplore(agent, state);
        },
        clear: intent.clear,
        resetMemory: intent.resetMemory,
        resetMode() {
            intent.resetMode(null, null, { clearLocomotion: false });
        },
        getMode: intent.getMode,
        getTrackedGoalId: intent.getTrackedGoalId,
        clearTrackedGoal: intent.clearTrackedGoal,
        hasMoveTarget(agent) {
            return locomotion.hasMoveTarget(agent, null);
        },
        navBehavior: () => behaviorById.get(navBehaviorId),
    };
}
