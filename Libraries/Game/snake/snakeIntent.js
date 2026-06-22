import { perceiveAgentWorld, findNearestVisibleThreat as findNearestVisibleThreatCore } from "../../AI/perception/agentWorldPerception.js";
import { getAgentRelationship } from "../agents/agentPopulationRegistry.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
function snakePerceptionOptions(visionCone) {
    const config = getSnakeGameConfig();
    const cone = visionCone ?? config.visionCone;
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: config.fleeRange ?? cone.range,
        resolveRelationship: getAgentRelationship,
    };
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone) {
    return findNearestVisibleThreatCore(seeker, selfHeadId, state, registry, visionCone, snakePerceptionOptions(visionCone));
}
export function perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone) {
    const config = getSnakeGameConfig();
    const cone = visionCone ?? config.visionCone;
    return perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, cone, snakePerceptionOptions(cone));
}
