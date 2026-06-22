import { applyKineticAcceleration } from "../Motion/applyAcceleration.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { getPhysicsSettings } from "../../Core/GamePhysicsSettings.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { maySnakeHeadReceiveRoll } from "../Game/snake/snakeSteeringLease.js";
import { syncFleeBallTurretFacing } from "../Game/snake/fleeAgent/fleeBallTurret.js";
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
function snakeRollBlocked(world, prop) {
    if (prop._snakeSteering && !world) return true;
    if (!world) return false;
    return !maySnakeHeadReceiveRoll(world, prop);
}
export function steerRollToward(prop, dirX, dirY, config, world = null) {
    if (snakeRollBlocked(world, prop)) return;
    if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) return decelerateRoll(prop, config, world);
    prop._groundRollDrive = { kind: "thrust", dirX, dirY, accel: config.accel, maxSpeed: config.maxSpeed };
    wakeKineticBody(prop);
    if (prop.type === "flee_ball") syncFleeBallTurretFacing(prop, 48);
}
export function decelerateRoll(prop, config, world = null) {
    if (snakeRollBlocked(world, prop)) return;
    prop._groundRollDrive = { kind: "brake", accel: config.accel };
    wakeKineticBody(prop);
}
export function applyGroundRollDrive(prop, dtSec, world = null) {
    if (world && prop._groundRollDrive && !maySnakeHeadReceiveRoll(world, prop)) {
        clearGroundRollDrive(prop);
        return false;
    }
    const drive = prop._groundRollDrive;
    if (!drive) return false;
    const dtMs = dtSec * 1000;
    if (drive.kind === "brake") {
        const braked = applyRollBrake(prop, dtSec, drive.accel);
        syncFleeBallTurretFacing(prop, dtMs);
        return braked;
    }
    applyRollThrust(prop, dtSec, drive.dirX, drive.dirY, drive.accel, drive.maxSpeed);
    syncFleeBallTurretFacing(prop, dtMs);
    return true;
}
export function clearGroundRollDrive(prop) {
    delete prop._groundRollDrive;
}
