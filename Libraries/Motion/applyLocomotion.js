import { integrateSteering } from "./integrateSteering.js";
import { updateSeparation } from "./applySeparation.js";

/** @typedef {import("../Agent/types.js").MobileAgent} MobileAgent */

/**
 * Separation + steering integration for one mobile agent (no wall collision).
 *
 * @param {MobileAgent} mobile
 * @param {number} dtMs
 * @param {{ getNeighbors: (entity: object) => object[] }} spatialFrame
 * @param {{
 *   ignoreSeparationInDesired?: boolean,
 *   shouldMove?: boolean,
 *   alignAngleWithMovement?: boolean,
 *   externalSpeedMod?: number,
 * }} [options]
 */
export function applyMobileLocomotion(mobile, dtMs, spatialFrame, { ignoreSeparationInDesired = false, shouldMove = true, alignAngleWithMovement = true, externalSpeedMod = 1 } = {}) {
    updateSeparation(mobile, spatialFrame);
    const baseSpeed = mobile.speed;
    if (externalSpeedMod !== 1) mobile.speed = baseSpeed * externalSpeedMod;
    integrateSteering(mobile, dtMs, { ignoreSeparation: ignoreSeparationInDesired, shouldMove, alignAngleWithMovement });
    if (externalSpeedMod !== 1) mobile.speed = baseSpeed;
}
