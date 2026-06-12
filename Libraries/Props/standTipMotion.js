import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { lengthXY } from "../Math/Vec2.js";
import { integrateLongAxisRoll } from "./rollingMotion.js";
import { syncLongAxisCollisionShape } from "./longAxisCollision.js";
import { convertStandTipToFallenLog, isStandTipFallen, isStandTipProp } from "../Spatial/transforms/longAxisBox3d.js";
import { measureTipFallWallBlock } from "./tipWallSupport.js";
import { wallContextFromState } from "../Spatial/query/wallContext.js";
const DEFAULT_FALL_ANGLE = Math.PI / 2 - 0.08;
/**
 * Upright tip rolls about local X; yaw must be ⊥ push so the cylinder falls forward.
 *
 * @param {number} pushAngle — world direction of the push (velocity, impulse, or shove normal)
 */
export function standTipFacingFromPush(pushAngle) {
    return pushAngle - Math.PI / 2;
}
/**
 * @param {object} body
 */
export function initStandTipState(body) {
    body.rollAngle = body.rollAngle ?? 0;
    body.rollOmega = body.rollOmega ?? 0;
    body.isFallen = body.isFallen ?? false;
    body._baseRadius = resolveBodyRadius(body);
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
/** True when tip physics or wall probes are needed this frame (idle upright barrels → false). */
export function needsStandTipIntegration(body) {
    if (!isStandTipProp(body) || body.isFallen) return false;
    if (isStandTipActive(body)) return true;
    if (Math.abs(body.angularVelocity ?? 0) > 0.04) return true;
    const pushThreshold = body.strategy?.tipPushSpeed ?? 9;
    return lengthXY(body.vx ?? 0, body.vy ?? 0) > pushThreshold;
} /**
 * Tip integration after collisions — same frame as actor shoves.
 *
 * @param {object} state
 * @param {number} dtMs
 */
export function integrateStandTipsAfterCollisions(state, dtMs) {
    const wallCtx = wallContextFromState(state);
    state.entityRegistry.forEachOfKind("pickup", (pickup) => {
        if (pickup.isDead || !isStandTipProp(pickup)) return;
        if (!pickup.isFallen && needsStandTipIntegration(pickup)) integrateStandTip(pickup, dtMs, { wallCtx });
        syncLongAxisCollisionShape(pickup);
    });
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
    const speed = lengthXY(vx, vy);
    const pushThreshold = strategy.tipPushSpeed ?? 9;
    if (speed > pushThreshold && mobility > 0.05) {
        body.facing = standTipFacingFromPush(Math.atan2(vy, vx));
        rollOmega += (speed - pushThreshold) * 0.02 * dt * mobility;
        if (rollAngle < 0.1) rollOmega += 0.65 * dt * mobility;
    }
    if (rollAngle > 0.02 && mobility > 0.05) {
        const h = strategy.rollHeight ?? strategy.uprightHeight ?? resolveBodyRadius(body) * 2.5;
        const grav = strategy.tipGravity ?? 16;
        rollOmega += (grav / Math.max(h * 0.01, 0.5)) * Math.sin(rollAngle) * dt * mobility;
    }
    const damping = strategy.tipDamping ?? 2.8;
    rollOmega *= Math.exp(-damping * dt);
    if (wallBlock >= 0.92) rollOmega = 0;
    else rollOmega *= mobility;
    rollAngle += rollOmega * dt;
    const maxAngle = wallBlock >= 0.75 ? Math.min(fallAngle - 0.12, Math.PI / 2 - 0.15) : Math.PI / 2;
    rollAngle = Math.min(rollAngle, maxAngle);
    body.rollAngle = rollAngle;
    body.rollOmega = rollOmega;
    if (rollAngle >= fallAngle && wallBlock < 0.75) convertStandTipToFallenLog(body);
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
}
