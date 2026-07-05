import { physicsSettings } from "../../Physics/physics.js";
import { navHasPath } from "../../Pathfinding/navSession.js";
import { REPLAN_PRIORITY_TARGET } from "../../Pathfinding/hpaReplan.js";
import { HpaNavSession } from "../../Pathfinding/navSession.js";
import { buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay } from "../../Pathfinding/navSession.js";
import { getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward, clearGroundRollDrive } from "../kineticRollActuator.js";
import { FloorBelt } from "../../Spatial/grid/FloorCell.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../sandboxCapabilities.js";
export function createHpaGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, targetCellCol: null, targetCellRow: null, dragging: false, wasOnBelt: false, beltHandoffCooldown: { frames: 0 }, hpaNav: new HpaNavSession() };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run, state) => {
        run.targetWorld = null;
        run.targetCellCol = null;
        run.targetCellRow = null;
        run.dragging = false;
        run.wasOnBelt = false;
        run.beltHandoffCooldown.frames = 0;
        run.hpaNav.reset(state);
    };
    const releaseMoveTarget = (prop, run) => {
        clearGroundRollDrive(prop);
        clearRunTarget(run, state);
    };
    const applyMoveTarget = (run, world, forceReset = false) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        const cellChanged = snapped.col !== run.targetCellCol || snapped.row !== run.targetCellRow;
        run.targetWorld = snapped.world;
        run.targetCellCol = snapped.col;
        run.targetCellRow = snapped.row;
        if (forceReset || cellChanged) run.hpaNav.markTargetChanged();
    };
    /** @param {number} dtMs */
    const tickProp = (prop, run, dtMs) => {
        if (!run.targetWorld) return;
        const grid = state.obstacleGrid;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        if (groundNavArrivedAtTarget(prop, run.targetWorld, run.targetCellCol, run.targetCellRow, grid, config.stopRadius)) {
            releaseMoveTarget(prop, run);
            return;
        }
        const { vx, vy, steering, beltWasOnBelt } = driveGroundNav({
            prop,
            targetWorld: run.targetWorld,
            targetCellCol: run.targetCellCol,
            targetCellRow: run.targetCellRow,
            nav: run.hpaNav,
            beltWasOnBelt: run.wasOnBelt,
            beltHandoffCooldown: run.beltHandoffCooldown,
            state,
            dtMs: dtMs,
            pathSettings: buildHpaGroundNavPathSettings(state, prop, config.stopRadius),
        });
        run.wasOnBelt = beltWasOnBelt;
        if (!steering) {
            if (beltWasOnBelt) clearGroundRollDrive(prop);
            return;
        }
        if (vx === 0 && vy === 0) return;
        steerRollToward(prop, vx, vy, config, steering?.desiredSpeed);
    };
    return {
        id: HPA_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            const run = getRun(prop);
            run.dragging = true;
            applyMoveTarget(run, world, true);
            return true;
        },
        onPointerMove(prop, world) {
            const run = getRun(prop);
            if (!run.dragging || !run.targetWorld) return;
            applyMoveTarget(run, world);
        },
        onPointerUp(prop) {
            getRun(prop).dragging = false;
        },
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            run.dragging = false;
            applyMoveTarget(run, world, true);
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            applyMoveTarget(run, world);
        },
        hasMoveTarget(prop) {
            return getRun(prop).targetWorld != null;
        },
        getTargetCell(prop) {
            const run = getRun(prop);
            if (!run.targetWorld) return null;
            return { col: run.targetCellCol, row: run.targetCellRow };
        },
        needsNavRetry(prop) {
            const run = getRun(prop);
            if (!run.targetWorld) return true;
            if (run.hpaNav.isRoutePending()) return false;
            return !navHasPath(run.hpaNav.navState);
        },
        replanMoveTarget(prop, state) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            run.hpaNav.replan(prop, run.targetWorld.x, run.targetWorld.y, state, REPLAN_PRIORITY_TARGET);
        },
        getLocomotionStatus(prop) {
            const run = getRun(prop);
            const nav = run.hpaNav.navState;
            return { hasRoute: navHasPath(nav), replanPending: run.hpaNav.isRoutePending(), stuckFrames: nav.stuckFrames, pathLen: nav.pathLen };
        },
        clearMoveTarget(prop) {
            clearGroundRollDrive(prop);
            clearRunTarget(getRun(prop), state);
        },
        tick(prop, dtMs) {
            tickProp(prop, getRun(prop), dtMs);
        },
        tickWorld(dtMs) {
            propRuns.forEach((run, propId) => {
                if (!run.targetWorld) return;
                const prop = state.entityRegistry.getLive(propId);
                if (!prop) {
                    propRuns.delete(propId);
                    return;
                }
                tickProp(prop, run, dtMs);
            });
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            if (!run?.targetWorld) return null;
            const grid = state.obstacleGrid;
            if (FloorBelt.isEntityOnBelt(grid, prop.x, prop.y))
                return {
                    mode: "direct",
                    pathNodes: [
                        { x: prop.x, y: prop.y },
                        { x: run.targetWorld.x, y: run.targetWorld.y },
                    ],
                    targetX: run.targetWorld.x,
                    targetY: run.targetWorld.y,
                };
            const nav = run.hpaNav.navState;
            const progressIdx = nav.pathProgressIdx;
            const trace =
                nav.pathLen > 0 && nav.pathSlot >= 0
                    ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.nav.worker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid)
                    : { pathNodes: [] };
            const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.nav.worker, nav.pathSlot, nav.pathLen) : null;
            return { mode: "hpa", pathNodes: trace.pathNodes, targetX: run.targetWorld.x, targetY: run.targetWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
        },
        reset() {
            propRuns.forEach((run) => run.hpaNav.reset(state));
            propRuns.clear();
        },
    };
}
import { snapNavGoalWorldInto } from "../../Navigation/navGraph.js";
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
    const config = getKineticRollConfig(prop);
    settings.pathWaypointArrival = Math.max(hpaNav.pathWaypointArrivalMin, (prop.radius ?? 6) * hpaNav.pathWaypointArrivalRadiusFactor);
    settings.arrivalDistance = stopRadius;
    settings.maxSpeed = config.maxSpeed;
    settings.accel = config.accel;
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
