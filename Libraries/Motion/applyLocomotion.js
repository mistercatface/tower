import { integrateSteering } from "./integrateSteering.js";
/** @typedef {import("../Agent/types.js").MobileAgent} MobileAgent */
/**
 * Steering integration for one mobile agent (no wall collision).
 *
 * @param {MobileAgent} mobile
 * @param {number} dtMs
 * @param {{
 *   shouldMove?: boolean,
 *   alignAngleWithMovement?: boolean,
 *   externalSpeedMod?: number,
 * }} [options]
 */
export function applyMobileLocomotion(mobile, dtMs, { shouldMove = true, alignAngleWithMovement = true, externalSpeedMod = 1 } = {}) {
    const baseSpeed = mobile.speed;
    if (externalSpeedMod !== 1) mobile.speed = baseSpeed * externalSpeedMod;
    integrateSteering(mobile, dtMs, { shouldMove, alignAngleWithMovement });
    if (externalSpeedMod !== 1) mobile.speed = baseSpeed;
}
