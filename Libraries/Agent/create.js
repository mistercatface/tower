import { createSeparationState } from "../Motion/applySeparation.js";
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
export function getMobileAgent(entity) {
    return entity.mobile ?? entity;
}
export function agentPose(source) {
    return { x: source.x, y: source.y, radius: source.radius ?? 6 };
}
