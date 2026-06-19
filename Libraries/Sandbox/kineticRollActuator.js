import { applyKineticAcceleration } from "../Motion/applyAcceleration.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { getPhysicsSettings } from "../../Core/GamePhysicsSettings.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
export function snapMoveTargetToCellCenter(grid, world) {
    const { col, row } = grid.worldToGrid(world.x, world.y);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return { world, col: null, row: null };
    return { world: grid.gridToWorld(col, row), col, row };
}
export function getKineticRollConfig(prop, overrides = {}) {
    return { ...getPhysicsSettings().groundNavRoll, ...prop.strategy.groundNav, ...overrides };
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
    applyKineticAcceleration(prop, dirX * accel, dirY * accel, dtSec);
    const speed = Math.hypot(prop.vx, prop.vy);
    if (speed > maxSpeed) {
        prop.vx = (prop.vx / speed) * maxSpeed;
        prop.vy = (prop.vy / speed) * maxSpeed;
    }
    applyRollSpin(prop);
    wakeKineticBody(prop);
}
export function steerRollToward(prop, dirX, dirY, config) {
    prop._groundRollDrive = { kind: "thrust", dirX, dirY, accel: config.accel, maxSpeed: config.maxSpeed };
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
