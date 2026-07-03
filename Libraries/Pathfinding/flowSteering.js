import { sampleFlowDirectionInto } from "./sampleFlowDirection.js";
/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
const FLOW_DIR_SCRATCH = { x: 0, y: 0 };
export function computeFlowFieldSteering(pose, targetX, targetY, flowFieldGrid) {
    const flowField = flowFieldGrid.getReadyFlowField(targetX, targetY);
    if (!flowField) return null;
    const dir = sampleFlowDirectionInto(FLOW_DIR_SCRATCH, pose.x, pose.y, flowField, flowFieldGrid.frame);
    if (!dir) return null;
    return { desiredX: dir.x, desiredY: dir.y };
}
