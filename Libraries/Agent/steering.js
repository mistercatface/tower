import { normalizeVector } from "../Math/Vec2.js";
/** @typedef {import("./types.js").AgentPose} AgentPose */
/** @typedef {import("./types.js").MobileAgent} MobileAgent */
/** @typedef {import("./types.js").SteeringResult} SteeringResult */
/** @returns {{ x: number, y: number }} */
export function seekDirection(dx, dy) {
    const vec = normalizeVector(dx, dy);
    return { x: vec.x, y: vec.y };
}
/** @returns {{ x: number, y: number }} */
export function seekDirectionToward(x, y, targetX, targetY) {
    return seekDirection(targetX - x, targetY - y);
}
/**
 * Pure direct seek — no mutation.
 * @param {AgentPose} pose
 * @returns {SteeringResult}
 */
export function computeDirectSteering(pose, targetX, targetY) {
    const dir = seekDirectionToward(pose.x, pose.y, targetX, targetY);
    return { desiredX: dir.x, desiredY: dir.y };
}
/**
 * @param {Pick<MobileAgent, "desiredX" | "desiredY">} agent — mutated in place
 * @param {SteeringResult} result
 */
export function applySteeringResult(agent, result) {
    agent.desiredX = result.desiredX;
    agent.desiredY = result.desiredY;
}
/**
 * @param {Pick<MobileAgent, "desiredX" | "desiredY">} agent
 * @returns {{ x: number, y: number }}
 */
export function applyDesiredDirection(agent, dx, dy) {
    const dir = seekDirection(dx, dy);
    agent.desiredX = dir.x;
    agent.desiredY = dir.y;
    return dir;
}
/**
 * @param {AgentPose & Pick<MobileAgent, "desiredX" | "desiredY">} agent
 * @returns {{ x: number, y: number }}
 */
export function applyDesiredDirectionToward(agent, targetX, targetY) {
    return applyDesiredDirection(agent, targetX - agent.x, targetY - agent.y);
}
