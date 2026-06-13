import { steerLocomotionWorldProp, stopLocomotionWorldProp, usesLocomotionWorldProp } from "../Props/locomotionWorldProp.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { strokeCircle, strokeSegment } from "../Canvas/CanvasPath.js";
const ROLL_TO_CURSOR_DEFAULTS = { maxSpeed: 180, accel: 600, stopRadius: 6 };
/** End cursor move intent — locomotion props keep walking until desired steering is cleared. */
export function releaseRollMoveTarget(prop) {
    stopLocomotionWorldProp(prop);
}
/** @param {object} prop @param {object} [overrides] */
export function getRollToCursorConfig(prop, overrides = {}) {
    return { ...ROLL_TO_CURSOR_DEFAULTS, ...prop.strategy?.rollToCursor, ...overrides };
}
/** @param {object} prop */
export function applyRollSpin(prop) {
    if (!prop.strategy?.rolls) return;
    const speed = Math.hypot(prop.vx, prop.vy);
    prop.angularVelocity = (speed / (prop.radius || 8)) * 0.12;
}
/**
 * @param {object} prop
 * @param {number} dt
 * @param {{ accel: number }} config
 * @returns {boolean} true when the body was still moving
 */
export function decelerateRoll(prop, dt, config) {
    if (stopLocomotionWorldProp(prop)) return Math.hypot(prop.vx ?? 0, prop.vy ?? 0) > 0;
    const speed = Math.hypot(prop.vx, prop.vy);
    if (speed <= 0) return false;
    const decel = config.accel * dt * 2;
    if (speed <= decel) {
        prop.vx = 0;
        prop.vy = 0;
        prop.angularVelocity = 0;
    } else {
        prop.vx -= (prop.vx / speed) * decel;
        prop.vy -= (prop.vy / speed) * decel;
        applyRollSpin(prop);
    }
    wakePushableBody(prop);
    return true;
}
/**
 * @param {object} prop
 * @param {number} dirX unit direction x
 * @param {number} dirY unit direction y
 * @param {number} dt
 * @param {{ maxSpeed: number, accel: number }} config
 */
export function steerRollToward(prop, dirX, dirY, dt, config) {
    if (usesLocomotionWorldProp(prop)) {
        steerLocomotionWorldProp(prop, dirX, dirY, config);
        return;
    }
    const targetVx = dirX * config.maxSpeed;
    const targetVy = dirY * config.maxSpeed;
    const dvx = targetVx - prop.vx;
    const dvy = targetVy - prop.vy;
    const diff = Math.hypot(dvx, dvy);
    if (diff > 0) {
        const step = config.accel * dt;
        if (diff <= step) {
            prop.vx = targetVx;
            prop.vy = targetVy;
        } else {
            prop.vx += (dvx / diff) * step;
            prop.vy += (dvy / diff) * step;
        }
    }
    applyRollSpin(prop);
    wakePushableBody(prop);
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
    const lineScale = getCanvasLineScale(ctx);
    ctx.save();
    if (style.dashed) ctx.setLineDash([4 * lineScale, 4 * lineScale]);
    ctx.strokeStyle = style.lineColor;
    ctx.lineWidth = (style.lineWidth ?? 1.5) * lineScale;
    strokeSegment(ctx, fromX, fromY, toX, toY);
    ctx.setLineDash([]);
    ctx.strokeStyle = style.markerColor;
    ctx.lineWidth = 2 * lineScale;
    strokeCircle(ctx, toX, toY, (style.markerRadius ?? 4) * lineScale);
    ctx.restore();
}
