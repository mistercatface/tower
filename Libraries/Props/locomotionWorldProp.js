import { initMobileAgent } from "../Agent/create.js";
import { applySteeringResult } from "../Agent/steering.js";
import { applyEntityLocomotion } from "../Motion/applyEntityLocomotion.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";

/** @param {object} prop */
export function usesLocomotionWorldProp(prop) {
    if (!prop?.strategy) return false;
    if (prop.strategy.locomotion === false) return false;
    if (prop.strategy.locomotion === true) return true;
    return !!prop.usesKinematicsBody && !prop.strategy.rolls && !prop.strategy.standTip;
}

/** @param {object} prop @param {{ maxSpeed?: number, accel?: number } | null | undefined} config */
function syncLocomotionParams(prop, config) {
    const rtc = prop.strategy?.rollToCursor ?? {};
    prop.speed = config?.maxSpeed ?? rtc.maxSpeed ?? 50;
    prop.accelRate = config?.accel ?? rtc.accel ?? 220;
}

/** @param {object} prop */
export function ensureLocomotionWorldProp(prop) {
    if (!usesLocomotionWorldProp(prop)) return false;
    if (prop.mobile === prop && prop.separation) return true;
    const rtc = prop.strategy?.rollToCursor ?? {};
    initMobileAgent(prop, {
        speed: rtc.maxSpeed ?? 50,
        accelRate: rtc.accel ?? 220,
        turnSpeed: 10,
    });
    return true;
}

/** @param {object} prop @param {number} dirX @param {number} dirY @param {{ maxSpeed?: number, accel?: number }} config */
export function steerLocomotionWorldProp(prop, dirX, dirY, config) {
    ensureLocomotionWorldProp(prop);
    syncLocomotionParams(prop, config);
    applySteeringResult(prop, { desiredX: dirX, desiredY: dirY });
    wakePushableBody(prop);
}

/** @param {object} prop */
export function stopLocomotionWorldProp(prop) {
    if (!usesLocomotionWorldProp(prop)) return false;
    applySteeringResult(prop, { desiredX: 0, desiredY: 0 });
    wakePushableBody(prop);
    return true;
}

/**
 * @param {object} prop
 * @param {number} dt
 * @param {{ getNeighbors: (entity: object) => object[] } | null | undefined} spatialFrame
 * @returns {boolean}
 */
export function updateLocomotionWorldProp(prop, dt, spatialFrame) {
    if (!usesLocomotionWorldProp(prop) || !spatialFrame) return false;
    ensureLocomotionWorldProp(prop);
    const desiredSq = (prop.desiredX ?? 0) ** 2 + (prop.desiredY ?? 0) ** 2;
    applyEntityLocomotion(prop, dt, spatialFrame, { alignAngleWithMovement: desiredSq > 0.0001 });
    return true;
}
