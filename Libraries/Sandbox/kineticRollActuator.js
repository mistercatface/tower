import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { strokeCircle, strokeSegment } from "../Canvas/CanvasPath.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
const GROUND_NAV_ROLL_DEFAULTS = { maxSpeed: 180, accel: 600, stopRadius: 6 };
export const FLOW_GROUND_NAV_RECENTER_THRESHOLD = 400;
export function snapMoveTargetToCellCenter(grid, world) {
    const { col, row } = grid.worldToGrid(world.x, world.y);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return { world, col: null, row: null };
    return { world: grid.gridToWorld(col, row), col, row };
}
export function clearMoveTarget(_prop) {}
export function getKineticRollConfig(prop, overrides = {}) {
    const strategyRoll = prop.strategy?.groundNav ?? prop.strategy?.rollToCursor;
    return { ...GROUND_NAV_ROLL_DEFAULTS, ...strategyRoll, ...overrides };
}
export function applyRollSpin(prop) {
    if (!prop.strategy?.rolls) return;
    const speed = Math.hypot(prop.vx, prop.vy);
    prop.angularVelocity = (speed / (prop.radius || 8)) * 0.12;
}
export function decelerateRoll(prop, dt, config) {
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
    wakeKineticBody(prop);
    return true;
}
export function steerRollToward(prop, dirX, dirY, dt, config) {
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
    wakeKineticBody(prop);
}
export function drawGroundNavTargetOverlay(ctx, fromX, fromY, toX, toY, style) {
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
