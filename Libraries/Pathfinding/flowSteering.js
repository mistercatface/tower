import { sampleFlowDirectionOnGrid } from "./sampleFlowDirection.js";

/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */

/**
 * @param {AgentPose} pose
 * @param {Uint8Array} flowField
 * @param {import("./FlowFieldGrid.js").FlowFieldGrid} flowFieldGrid
 * @returns {SteeringResult | null}
 */
export function computeFlowSteering(pose, flowField, flowFieldGrid) {
    const dir = sampleFlowDirectionOnGrid(pose.x, pose.y, flowField, flowFieldGrid);
    if (!dir) return null;
    return { desiredX: dir.x, desiredY: dir.y };
}
