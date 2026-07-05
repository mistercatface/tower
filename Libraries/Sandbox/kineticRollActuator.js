import { applyKineticAcceleration } from "../Physics/physics.js";
import { wakeKineticBody } from "../Physics/physics.js";
import { physicsSettings } from "../Physics/physics.js";
import {  cellInRect  } from "../Spatial/spatial.js";
export function snapMoveTargetToCellCenter(grid, world) {
    const idx = grid.worldToIdx(world.x, world.y);
    if (idx === -1) return { world, col: null, row: null };
    const col = idx % grid.cols;
    const row = (idx / grid.cols) | 0;
    return { world: grid.gridToWorldByIdx(idx), col, row };
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
export function clearGroundRollDrive(prop) {
    delete prop._groundRollDrive;
}
