import { createSeparationState } from "../Motion/applySeparation.js";

/** @typedef {import("./types.js").MobileAgent} MobileAgent */
/** @typedef {import("./types.js").AgentPose} AgentPose */

/**
 * Initialize locomotion fields on an existing entity. Pose (x, y, angle, radius) stays on host.
 * Sets host.mobile = host so navigation/motion can target the contract explicitly.
 *
 * @param {object} host
 * @param {Partial<MobileAgent>} [options]
 * @returns {MobileAgent}
 */
export function initMobileAgent(host, options = {}) {
    host.vx = options.vx ?? host.vx ?? 0;
    host.vy = options.vy ?? host.vy ?? 0;
    host.desiredX = options.desiredX ?? host.desiredX ?? 0;
    host.desiredY = options.desiredY ?? host.desiredY ?? 0;
    if (options.speed !== undefined) host.speed = options.speed;
    if (options.accelRate !== undefined) host.accelRate = options.accelRate;
    if (options.turnSpeed !== undefined) host.turnSpeed = options.turnSpeed;
    if (options.mass !== undefined) host.mass = options.mass;
    if (options.radius !== undefined && host.radius === undefined) host.radius = options.radius;
    host.separation = options.separation ?? host.separation ?? createSeparationState();
    host.mobile = host;
    return host;
}

/**
 * @param {object} entity
 * @returns {MobileAgent}
 */
export function getMobileAgent(entity) {
    return entity.mobile ?? entity;
}

/**
 * Standalone mobile agent snapshot (not a game entity).
 *
 * @param {number} x
 * @param {number} y
 * @param {Partial<MobileAgent>} [options]
 * @returns {MobileAgent}
 */
export function createMobileAgent(x, y, options = {}) {
    return initMobileAgent({ x, y, angle: options.angle ?? 0, radius: options.radius ?? 6 }, options);
}

/**
 * Extract planning pose from any object with x/y (entity, mobile agent, snapshot).
 * @param {{ x: number, y: number, radius?: number }} source
 * @returns {AgentPose}
 */
export function agentPose(source) {
    return { x: source.x, y: source.y, radius: source.radius ?? 6 };
}
