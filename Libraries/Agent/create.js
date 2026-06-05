/** @typedef {import("./types.js").MobileAgent} MobileAgent */
/** @typedef {import("./types.js").AgentPose} AgentPose */

/**
 * @param {number} x
 * @param {number} y
 * @param {Partial<MobileAgent>} [options]
 * @returns {MobileAgent}
 */
export function createMobileAgent(x, y, options = {}) {
    return {
        x,
        y,
        vx: options.vx ?? 0,
        vy: options.vy ?? 0,
        desiredX: options.desiredX ?? 0,
        desiredY: options.desiredY ?? 0,
        speed: options.speed ?? 100,
        accelRate: options.accelRate ?? 8,
        angle: options.angle ?? 0,
        turnSpeed: options.turnSpeed,
        radius: options.radius ?? 6,
        separation: options.separation ?? null,
        mass: options.mass,
    };
}

/**
 * Extract planning pose from any object with x/y (entity, mobile agent, snapshot).
 * @param {{ x: number, y: number, radius?: number }} source
 * @returns {AgentPose}
 */
export function agentPose(source) {
    return {
        x: source.x,
        y: source.y,
        radius: source.radius ?? 6,
    };
}
