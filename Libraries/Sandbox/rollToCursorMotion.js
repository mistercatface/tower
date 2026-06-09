import { steerLocomotionPickup, stopLocomotionPickup, usesLocomotionPickup } from "../Props/locomotionPickup.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
const ROLL_TO_CURSOR_DEFAULTS = { maxSpeed: 180, accel: 600, stopRadius: 6 };
/** @param {object} pickup @param {object} [overrides] */
export function getRollToCursorConfig(pickup, overrides = {}) {
    return { ...ROLL_TO_CURSOR_DEFAULTS, ...pickup.strategy?.rollToCursor, ...overrides };
}
/** @param {object} pickup */
export function applyRollSpin(pickup) {
    if (!pickup.strategy?.rolls) return;
    const speed = Math.hypot(pickup.vx, pickup.vy);
    pickup.angularVelocity = (speed / (pickup.radius || 8)) * 0.12;
}
/**
 * @param {object} pickup
 * @param {number} dt
 * @param {{ accel: number }} config
 * @returns {boolean} true when the body was still moving
 */
export function decelerateRoll(pickup, dt, config) {
    if (stopLocomotionPickup(pickup)) return Math.hypot(pickup.vx ?? 0, pickup.vy ?? 0) > 0;
    const speed = Math.hypot(pickup.vx, pickup.vy);
    if (speed <= 0) return false;
    const decel = config.accel * dt * 2;
    if (speed <= decel) {
        pickup.vx = 0;
        pickup.vy = 0;
        pickup.angularVelocity = 0;
    } else {
        pickup.vx -= (pickup.vx / speed) * decel;
        pickup.vy -= (pickup.vy / speed) * decel;
        applyRollSpin(pickup);
    }
    wakePushableBody(pickup);
    return true;
}
/**
 * @param {object} pickup
 * @param {number} dirX unit direction x
 * @param {number} dirY unit direction y
 * @param {number} dt
 * @param {{ maxSpeed: number, accel: number }} config
 */
export function steerRollToward(pickup, dirX, dirY, dt, config) {
    if (usesLocomotionPickup(pickup)) {
        steerLocomotionPickup(pickup, dirX, dirY, config);
        return;
    }
    const targetVx = dirX * config.maxSpeed;
    const targetVy = dirY * config.maxSpeed;
    const dvx = targetVx - pickup.vx;
    const dvy = targetVy - pickup.vy;
    const diff = Math.hypot(dvx, dvy);
    if (diff > 0) {
        const step = config.accel * dt;
        if (diff <= step) {
            pickup.vx = targetVx;
            pickup.vy = targetVy;
        } else {
            pickup.vx += (dvx / diff) * step;
            pickup.vy += (dvy / diff) * step;
        }
    }
    applyRollSpin(pickup);
    wakePushableBody(pickup);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {{ lineColor: string, markerColor: string, lineWidth?: number, markerRadius?: number, dashed?: boolean }} style
 */
export function drawRollTargetOverlay(ctx, fromX, fromY, toX, toY, style) {
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.save();
    if (style.dashed) ctx.setLineDash([4 * lineScale, 4 * lineScale]);
    ctx.strokeStyle = style.lineColor;
    ctx.lineWidth = (style.lineWidth ?? 1.5) * lineScale;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = style.markerColor;
    ctx.lineWidth = 2 * lineScale;
    ctx.beginPath();
    ctx.arc(toX, toY, (style.markerRadius ?? 4) * lineScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
