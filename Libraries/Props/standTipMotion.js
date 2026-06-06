import { integrateLongAxisRoll } from "./rollingMotion.js";
import { syncLongAxisCollisionShape } from "./longAxisCollision.js";
import { isStandTipFallen, isStandTipProp } from "../Spatial/transforms/longAxisBox3d.js";
import { measureTipFallWallBlock } from "./tipWallSupport.js";
import { wallContextFromState } from "../Spatial/query/wallContext.js";

const DEFAULT_FALL_ANGLE = Math.PI / 2 - 0.08;

/**
 * @param {object} body
 */
export function initStandTipState(body) {
    body.rollAngle = body.rollAngle ?? 0;
    body.rollOmega = body.rollOmega ?? 0;
    body.isFallen = body.isFallen ?? false;
    body._baseRadius = body._baseRadius ?? body.radius ?? 8;
}

/**
 * @param {object} body
 */
export function isStandTipActive(body) {
    if (!isStandTipProp(body)) return false;
    if (body.isFallen) return false;
    const rollOmega = body.rollOmega ?? 0;
    const rollAngle = body.rollAngle ?? 0;
    const fallAngle = body.strategy?.tipFallAngle ?? DEFAULT_FALL_ANGLE;
    return Math.abs(rollOmega) > 0.04 || (rollAngle > 0.03 && rollAngle < fallAngle - 0.03);
}

/**
 * Tip integration after collisions — same frame as actor shoves.
 *
 * @param {object} state
 * @param {number} dtMs
 */
export function integrateStandTipsAfterCollisions(state, dtMs) {
    if (!state?.pickups) return;
    const wallCtx = wallContextFromState(state);
    for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        if (pickup.isDead || !isStandTipProp(pickup)) continue;
        if (!pickup.isFallen) {
            integrateStandTip(pickup, dtMs, { wallCtx });
        }
        syncLongAxisCollisionShape(pickup);
    }
}

/**
 * @param {object} body
 * @param {number} dtMs
 * @param {{ wallCtx?: import("../Spatial/query/wallContext.js").WallContext | null }} [options]
 */
export function integrateStandTip(body, dtMs, { wallCtx = null } = {}) {
    const strategy = body.strategy ?? {};
    const dt = dtMs / 1000;
    const fallAngle = strategy.tipFallAngle ?? DEFAULT_FALL_ANGLE;
    const wallBlock = measureTipFallWallBlock(body, wallCtx);
    const mobility = 1 - wallBlock * 0.98;

    let rollAngle = body.rollAngle ?? 0;
    let rollOmega = body.rollOmega ?? 0;

    const w = body.angularVelocity ?? 0;
    if (Math.abs(w) > 0.04) {
        rollOmega += Math.abs(w) * 0.22;
        body.angularVelocity = 0;
    }

    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    const pushThreshold = strategy.tipPushSpeed ?? 9;
    if (speed > pushThreshold && mobility > 0.05) {
        body.facing = Math.atan2(vy, vx);
        rollOmega += (speed - pushThreshold) * 0.02 * dt * mobility;
        if (rollAngle < 0.1) {
            rollOmega += 0.65 * dt * mobility;
        }
    }

    if (rollAngle > 0.02 && mobility > 0.05) {
        const h = strategy.rollHeight ?? strategy.uprightHeight ?? (body._baseRadius ?? body.radius ?? 8) * 2.5;
        const grav = strategy.tipGravity ?? 16;
        rollOmega += (grav / Math.max(h * 0.01, 0.5)) * Math.sin(rollAngle) * dt * mobility;
    }

    const damping = strategy.tipDamping ?? 2.8;
    rollOmega *= Math.exp(-damping * dt);
    if (wallBlock >= 0.92) {
        rollOmega = 0;
    } else {
        rollOmega *= mobility;
    }

    rollAngle += rollOmega * dt;
    const maxAngle = wallBlock >= 0.75 ? Math.min(fallAngle - 0.12, Math.PI / 2 - 0.15) : Math.PI / 2;
    rollAngle = Math.min(rollAngle, maxAngle);

    body.rollAngle = rollAngle;
    body.rollOmega = rollOmega;

    if (rollAngle >= fallAngle && wallBlock < 0.75) {
        body.isFallen = true;
        body.rollAngle = Math.PI / 2;
        body.rollOmega = 0;
    }
}

/**
 * Fallen stand-tip props tumble like logs (rollAngle + facing).
 *
 * @param {object} body
 * @param {number} dtMs
 */
export function integrateStandTipMotion(body, dtMs) {
    if (!isStandTipFallen(body)) return;
    integrateLongAxisRoll(body, dtMs);
    body.angularVelocity = 0;
}
