import { agentPose, applySteeringResult, applyDesiredDirectionToward } from "../../Libraries/Agent/index.js";
import { computeFlowSteering } from "../../Libraries/Pathfinding/flowSteering.js";

export function steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowFieldKey) {
    if (flowFieldGrid) {
        const flowField = flowFieldGrid.getFlowField(targetX, targetY);
        if (flowField) {
            const steering = computeFlowSteering(agentPose(entity), flowField, flowFieldGrid);
            if (steering) {
                applySteeringResult(entity, steering);
                return "flow";
            }
        }
    }

    applyDesiredDirectionToward(entity, targetX, targetY);
    return "direct";
}
