import { applyMobileLocomotion } from "./applyLocomotion.js";

/**
 * Separation + steering + optional wall resolve for one entity.
 *
 * @param {{ mobile?: object } & object} entity
 * @param {number} dtMs
 * @param {{ getNeighbors: (entity: object) => object[] }} spatialFrame
 * @param {{
 *   externalSpeedMod?: number,
 *   ignoreSeparationInDesired?: boolean,
 *   shouldMove?: boolean,
 *   alignAngleWithMovement?: boolean,
 *   resolveAlignAngle?: (entity: object, requestedAlign: boolean) => boolean,
 *   resolveWalls?: (entity: object, spatialFrame: object) => boolean,
 * }} [options]
 * @returns {boolean} wall collision result (false when no resolveWalls)
 */
export function applyEntityLocomotion(
    entity,
    dtMs,
    spatialFrame,
    { externalSpeedMod = 1, ignoreSeparationInDesired = false, shouldMove = true, alignAngleWithMovement = true, resolveAlignAngle = null, resolveWalls = null } = {},
) {
    const mobile = entity.mobile ?? entity;
    let alignAngle = alignAngleWithMovement;
    if (resolveAlignAngle) alignAngle = resolveAlignAngle(entity, alignAngleWithMovement);
    applyMobileLocomotion(mobile, dtMs, spatialFrame, { externalSpeedMod, ignoreSeparationInDesired, shouldMove, alignAngleWithMovement: alignAngle });
    if (!resolveWalls) return false;
    return resolveWalls(entity, spatialFrame);
}
