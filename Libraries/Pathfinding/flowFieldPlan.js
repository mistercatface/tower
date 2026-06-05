import { computeDirectSteering } from "../Agent/steering.js";
import { computeFlowSteering } from "./flowSteering.js";

/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */

/**
 * Flow-field sample when available; direct seek fallback. Grid lookup stays caller responsibility.
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
            if (steering) {
                return { steering, mode: "flow" };
            }
        }
    }
    return {
        steering: computeDirectSteering(pose, targetX, targetY),
        mode: "direct",
    };
}
