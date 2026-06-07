/**
 * Top-down steering integration (desired direction → velocity → position).
 * NOT Libraries/Kinematics (ragdoll/gore) — see Libraries/Motion/index.js for roadmap.
 */
import { normalizeAngle } from "../Math/Angle.js";
import { addXY, lengthXY, normalizeXY } from "../Math/Vec2.js";
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
    const sepX = ignoreSeparation || !body.separation ? 0 : body.separation.x;
    const sepY = ignoreSeparation || !body.separation ? 0 : body.separation.y;
    const { nx: finalX, ny: finalY, len } = normalizeXY(body.desiredX + sepX, body.desiredY + sepY);
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
    addXY(body, body.vx * (dtMs / 1000), body.vy * (dtMs / 1000));
    if (body.separation) addXY(body, body.separation.pushX, body.separation.pushY);
}
