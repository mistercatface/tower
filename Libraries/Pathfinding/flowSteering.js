import { sampleFlowDirectionOnGrid } from "./sampleFlowDirection.js";

/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */

export function computeFlowSteering(pose, flowField, flowFieldGrid) {
    const dir = sampleFlowDirectionOnGrid(pose.x, pose.y, flowField, flowFieldGrid);
    if (!dir) return null;
    return { desiredX: dir.x, desiredY: dir.y };
}

export function computeFlowFieldSteering(pose, targetX, targetY, flowFieldGrid) {
    if (!flowFieldGrid) return null;
    const flowField = flowFieldGrid.getReadyFlowField(targetX, targetY);
    if (!flowField) return null;
    return computeFlowSteering(pose, flowField, flowFieldGrid);
}
