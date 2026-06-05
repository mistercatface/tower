import { agentPose } from "../../Libraries/Agent/index.js";
import { computeFlowFieldSteering } from "../../Libraries/Pathfinding/flowFieldPlan.js";

/**
 * Flow-field steering plan. Does not mutate desiredX/Y.
 * @returns {{ steering: import("../../Libraries/Agent/types.js").SteeringResult, mode: "flow" | "direct" }}
 */
export function planFlowFieldSteering(entity, targetX, targetY, flowFieldGrid) {
    return computeFlowFieldSteering(agentPose(entity), targetX, targetY, flowFieldGrid);
}
