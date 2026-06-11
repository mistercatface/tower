import { computeDirectSteering } from "../Agent/steering.js";
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
/**
 * @param {AgentPose} pose
 * @param {number} targetX
 * @param {number} targetY
 * @param {import("./FlowFieldGrid.js").FlowFieldGrid | null} flowFieldGrid
 * @returns {{ steering: SteeringResult, mode: "flow" | "direct" }}
 */
export function computeFlowFieldSteering(pose, targetX, targetY, flowFieldGrid) {
    if (flowFieldGrid) {
        const flowField = flowFieldGrid.getFlowField(targetX, targetY);
        if (flowField) {
            const steering = computeFlowSteering(pose, flowField, flowFieldGrid);
            if (steering) return { steering, mode: "flow" };
        }
    }
    return { steering: computeDirectSteering(pose, targetX, targetY), mode: "direct" };
}
