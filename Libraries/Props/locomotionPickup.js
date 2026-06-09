import { initMobileAgent } from "../Agent/create.js";
import { applySteeringResult } from "../Agent/steering.js";
import { applyEntityLocomotion } from "../Motion/applyEntityLocomotion.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";

/** @param {object} pickup */
export function usesLocomotionPickup(pickup) {
    if (!pickup?.strategy) return false;
    if (pickup.strategy.locomotion === false) return false;
    if (pickup.strategy.locomotion === true) return true;
    return !!pickup.usesKinematicsBody && !pickup.strategy.rolls && !pickup.strategy.standTip;
}

/** @param {object} pickup @param {{ maxSpeed?: number, accel?: number } | null | undefined} config */
function syncLocomotionParams(pickup, config) {
    const rtc = pickup.strategy?.rollToCursor ?? {};
    pickup.speed = config?.maxSpeed ?? rtc.maxSpeed ?? 50;
    pickup.accelRate = config?.accel ?? rtc.accel ?? 220;
}

/** @param {object} pickup */
export function ensureLocomotionPickup(pickup) {
    if (!usesLocomotionPickup(pickup)) return false;
    if (pickup.mobile === pickup && pickup.separation) return true;
    const rtc = pickup.strategy?.rollToCursor ?? {};
    initMobileAgent(pickup, {
        speed: rtc.maxSpeed ?? 50,
        accelRate: rtc.accel ?? 220,
        turnSpeed: 10,
    });
    return true;
}

/** @param {object} pickup @param {number} dirX @param {number} dirY @param {{ maxSpeed?: number, accel?: number }} config */
export function steerLocomotionPickup(pickup, dirX, dirY, config) {
    ensureLocomotionPickup(pickup);
    syncLocomotionParams(pickup, config);
    applySteeringResult(pickup, { desiredX: dirX, desiredY: dirY });
    wakePushableBody(pickup);
}

/** @param {object} pickup */
export function stopLocomotionPickup(pickup) {
    if (!usesLocomotionPickup(pickup)) return false;
    applySteeringResult(pickup, { desiredX: 0, desiredY: 0 });
    wakePushableBody(pickup);
    return true;
}

/**
 * @param {object} pickup
 * @param {number} dt
 * @param {{ getNeighbors: (entity: object) => object[] } | null | undefined} spatialFrame
 * @returns {boolean}
 */
export function updateLocomotionPickup(pickup, dt, spatialFrame) {
    if (!usesLocomotionPickup(pickup) || !spatialFrame) return false;
    ensureLocomotionPickup(pickup);
    const desiredSq = (pickup.desiredX ?? 0) ** 2 + (pickup.desiredY ?? 0) ** 2;
    applyEntityLocomotion(pickup, dt, spatialFrame, { alignAngleWithMovement: desiredSq > 0.0001 });
    return true;
}
