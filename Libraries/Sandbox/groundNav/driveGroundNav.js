import { snapNavGoalWorldInto } from "../../Navigation/navGraph.js";
import { physicsSettings } from "../../Physics/physics.js";
import { FloorBelt } from "../../Spatial/grid/FloorCell.js";
const SCRATCH_STEER_TARGET = { x: 0, y: 0 };
/**
 * @param {object} prop
 * @param {{ x: number, y: number }} targetWorld
 * @param {number | null} targetCellCol
 * @param {number | null} targetCellRow
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} stopRadius
 */
export function groundNavArrivedAtTarget(prop, targetWorld, targetCellCol, targetCellRow, grid, stopRadius) {
    const onBelt = FloorBelt.isEntityOnBelt(grid, prop.x, prop.y);
    const targetOnBelt = targetCellCol != null && targetCellRow != null && FloorBelt.isBeltAtIdx(grid, targetCellCol + targetCellRow * grid.cols);
    const dist = Math.hypot(targetWorld.x - prop.x, targetWorld.y - prop.y);
    return dist <= stopRadius && (!targetOnBelt || onBelt);
}
const HPA_PATH_SETTINGS_SCRATCH = {};
/** @param {object} state @param {object} prop @param {number} stopRadius */
export function buildHpaGroundNavPathSettings(state, prop, stopRadius) {
    const hpaNav = physicsSettings.groundNavHpa;
    const settings = Object.assign(HPA_PATH_SETTINGS_SCRATCH, state.nav.settings);
    settings.pathWaypointArrival = Math.max(hpaNav.pathWaypointArrivalMin, (prop.radius ?? 6) * hpaNav.pathWaypointArrivalRadiusFactor);
    settings.arrivalDistance = stopRadius;
    return settings;
}
/**
 * HPA ground-nav tick — belt handoff + session replan/steer loop.
 * @param {{
 *   prop: object,
 *   targetWorld: { x: number, y: number },
 *   targetCellCol?: number | null,
 *   targetCellRow?: number | null,
 *   nav: ReturnType<import("./hpaGroundNavSession.js").createHpaGroundNavSession>,
 *   beltWasOnBelt: boolean,
 *   beltHandoffCooldown?: { frames: number },
 *   state: object,
 *   dtMs: number,
 *   pathSettings: object,
 * }} opts
 * @returns {{ vx: number, vy: number, steering: object | null, replanReason: string | null, beltWasOnBelt: boolean }}
 */
export function driveGroundNav({ prop, targetWorld, targetCellCol = null, targetCellRow = null, nav, beltWasOnBelt, beltHandoffCooldown, state, dtMs, pathSettings }) {
    const grid = state.obstacleGrid;
    if (FloorBelt.isEntityOnBelt(grid, prop.x, prop.y)) return { vx: 0, vy: 0, steering: null, replanReason: null, beltWasOnBelt: true };
    const steerTarget = snapNavGoalWorldInto(SCRATCH_STEER_TARGET, grid, prop.x, prop.y, targetWorld.x, targetWorld.y);
    if (beltWasOnBelt) {
        const cooldownFrames = beltHandoffCooldown.frames;
        if (cooldownFrames > 0) {
            beltHandoffCooldown.frames = cooldownFrames - 1;
            return { vx: 0, vy: 0, steering: null, replanReason: null, beltWasOnBelt: false };
        }
        nav.reset(state);
        nav.replan(prop, steerTarget.x, steerTarget.y, state);
        beltHandoffCooldown.frames = state.nav.settings.stuckReplanFrames;
        return { vx: 0, vy: 0, steering: null, replanReason: "beltHandoff", beltWasOnBelt: false };
    }
    const { steering, replanReason } = nav.update(prop, steerTarget.x, steerTarget.y, state, dtMs, pathSettings);
    return { vx: steering?.desiredX ?? 0, vy: steering?.desiredY ?? 0, steering, replanReason, beltWasOnBelt: false };
}
