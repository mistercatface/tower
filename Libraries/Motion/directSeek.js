import { normalizeVector } from "../Math/Vec2.js";

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
 * @param {{ desiredX?: number, desiredY?: number }} body
 * @returns {{ x: number, y: number }}
 */
export function applyDesiredDirection(body, dx, dy) {
    const dir = seekDirection(dx, dy);
    body.desiredX = dir.x;
    body.desiredY = dir.y;
    return dir;
}

/**
 * @param {{ x: number, y: number, desiredX?: number, desiredY?: number }} body
 * @returns {{ x: number, y: number }}
 */
export function applyDesiredDirectionToward(body, targetX, targetY) {
    return applyDesiredDirection(body, targetX - body.x, targetY - body.y);
}
