import { applyKineticAcceleration } from "../Motion/motionDynamics.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { physicsSettings } from "../Motion/physicsDefaults.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
export function snapMoveTargetToCellCenter(grid, world) {
    const col = grid.worldCol(world.x);
    const row = grid.worldRow(world.y);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return { world, col: null, row: null };
    return { world: grid.gridToWorld(col, row), col, row };
}
export function getKineticRollConfig(prop, overrides = null) {
    let base = prop._cachedRollBaseConfig;
    if (!base) {
        base = { ...physicsSettings.groundNavRoll, ...prop.strategy?.groundNav };
        prop._cachedRollBaseConfig = base;
    }
    if (overrides && Object.keys(overrides).length > 0) return { ...base, ...overrides };
    return base;
}
export function applyRollSpin(prop) {
    if (!prop.strategy?.rolls) return;
    const speed = Math.hypot(prop.vx, prop.vy);
    prop.angularVelocity = (speed / (prop.radius || 8)) * 0.12;
}
function applyRollBrake(prop, dtSec, accel) {
    const speed = Math.hypot(prop.vx, prop.vy);
    if (speed <= 0) return false;
    const decel = accel * dtSec * 2;
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
function applyRollThrust(prop, dtSec, dirX, dirY, accel, maxSpeed) {
    const len = Math.hypot(dirX, dirY);
    const dx = len > 0.001 ? dirX / len : 0;
    const dy = len > 0.001 ? dirY / len : 0;
    // Steering force: Desired Velocity - Current Velocity
    const desiredVx = dx * maxSpeed;
    const desiredVy = dy * maxSpeed;
    const steerX = desiredVx - (prop.vx || 0);
    const steerY = desiredVy - (prop.vy || 0);
    const steerLen = Math.hypot(steerX, steerY);
    if (steerLen > 0.001) {
        const ax = (steerX / steerLen) * accel;
        const ay = (steerY / steerLen) * accel;
        applyKineticAcceleration(prop, ax, ay, dtSec);
    }
    const speed = Math.hypot(prop.vx, prop.vy);
    if (speed > maxSpeed) {
        prop.vx = (prop.vx / speed) * maxSpeed;
        prop.vy = (prop.vy / speed) * maxSpeed;
    }
    applyRollSpin(prop);
    wakeKineticBody(prop);
}
export function steerRollToward(prop, dirX, dirY, config, targetSpeed = null) {
    if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) return decelerateRoll(prop, config);
    const limitSpeed = targetSpeed !== null ? Math.min(config.maxSpeed, targetSpeed) : config.maxSpeed;
    prop._groundRollDrive = { kind: "thrust", dirX, dirY, accel: config.accel, maxSpeed: limitSpeed };
    wakeKineticBody(prop);
}
export function decelerateRoll(prop, config) {
    prop._groundRollDrive = { kind: "brake", accel: config.accel };
    wakeKineticBody(prop);
}
export function applyGroundRollDrive(prop, dtSec) {
    const drive = prop._groundRollDrive;
    if (!drive) return false;
    if (drive.kind === "brake") return applyRollBrake(prop, dtSec, drive.accel);
    applyRollThrust(prop, dtSec, drive.dirX, drive.dirY, drive.accel, drive.maxSpeed);
    return true;
}
export function clearGroundRollDrive(prop) {
    delete prop._groundRollDrive;
}
