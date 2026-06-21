import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
import { perceiveSnakeIntentWorld, pickFleeCell, pickSnakeIntentPolicy } from "../../Game/snake/snakeIntent.js";
import { createAgentIntent } from "./createAgentIntent.js";
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
    const resolvedVision = visionCone ?? getSnakeGameConfig().visionCone;
    const locomotion = createCellTargetLocomotion(headNav);
    const intent = createAgentIntent({
        brain,
        sync,
        perceiveWorld: (agent, state) => perceiveSnakeIntentWorld(agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision),
        pickPolicy: pickSnakeIntentPolicy,
        transitionReason: (prevMode, nextMode) => {
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if (prevMode === "seek_food" && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        resolveExploreCell,
        resolveFleeCell: (agent, threat, state, avoidCell) => pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, undefined, avoidCell),
        locomotion,
        seekMode: "seek_food",
        fleeMode: "flee",
        exploreMode: "explore",
        seekArrivalRadius,
        rng,
    });
    return {
        ...intent,
        headNav,
        resetMode() {
            intent.resetMode(null, null);
        },
        hasMoveTarget() {
            return intent.hasMoveTarget(null, null);
        },
    };
}
