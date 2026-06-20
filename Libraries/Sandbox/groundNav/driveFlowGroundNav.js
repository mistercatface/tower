import { agentPose } from "../../Agent/index.js";
import { computeFlowFieldSteering } from "../../Pathfinding/flowSteering.js";
import { snapNavGoalWorld } from "../../Navigation/snapNavGoal.js";
/**
 * Flow-field ground-nav tick — steer target snap + flow sample.
 * @param {{ prop: object, targetWorld: { x: number, y: number }, flowFieldGrid: import("../../Pathfinding/FlowFieldGrid.js").FlowFieldGrid }} opts
 * @returns {{ vx: number, vy: number, steering: object | null, replanReason: string | null }}
 */
export function driveFlowGroundNav({ prop, targetWorld, flowFieldGrid }) {
    const steerTarget = snapNavGoalWorld(flowFieldGrid.navGraph, prop.x, prop.y, targetWorld.x, targetWorld.y);
    const steering = computeFlowFieldSteering(agentPose(prop), steerTarget.x, steerTarget.y, flowFieldGrid);
    if (!steering) return { vx: 0, vy: 0, steering: null, replanReason: "flowNotReady" };
    return { vx: steering.desiredX, vy: steering.desiredY, steering, replanReason: null };
}
