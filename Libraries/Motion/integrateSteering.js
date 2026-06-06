/**
 * Top-down steering integration (desired direction → velocity → position).
 * NOT Libraries/Kinematics (ragdoll/gore) — see Libraries/Motion/index.js for roadmap.
 */
import { normalizeAngle } from "../Math/Angle.js";
/** @typedef {import("../Agent/types.js").MobileAgent} MobileAgent */
/**
 * Blend desired direction + optional separation into velocity and position.
 * @param {MobileAgent} body — mutated in place
 * @param {number} dtMs
 * @param {{
 *   ignoreSeparation?: boolean,
 *   shouldMove?: boolean,
 *   alignAngleWithMovement?: boolean,
 * }} [options]
 */
export function integrateSteering(body, dtMs, options = {}) {
    const { ignoreSeparation = false, shouldMove = true, alignAngleWithMovement = true } = options;
    let finalX = body.desiredX + (ignoreSeparation || !body.separation ? 0 : body.separation.x);
    let finalY = body.desiredY + (ignoreSeparation || !body.separation ? 0 : body.separation.y);
    const len = Math.hypot(finalX, finalY);
    if (len > 0) {
        finalX /= len;
        finalY /= len;
    }
    if (alignAngleWithMovement && len > 0) {
        const targetAngle = Math.atan2(finalY, finalX);
        let angleDiff = targetAngle - body.angle;
        angleDiff = normalizeAngle(angleDiff);
        const turnSpeed = body.turnSpeed ?? 10;
        body.angle += angleDiff * Math.min(1, turnSpeed * (dtMs / 1000));
    }
    if (!shouldMove) return;
    const targetVx = len > 0 ? finalX * body.speed : 0;
    const targetVy = len > 0 ? finalY * body.speed : 0;
    const t = 1 - Math.exp(-body.accelRate * (dtMs / 1000));
    body.vx = (body.vx ?? 0) + (targetVx - (body.vx ?? 0)) * t;
    body.vy = (body.vy ?? 0) + (targetVy - (body.vy ?? 0)) * t;
    body.x += body.vx * (dtMs / 1000);
    body.y += body.vy * (dtMs / 1000);
    if (body.separation) {
        body.x += body.separation.pushX;
        body.y += body.separation.pushY;
    }
}
