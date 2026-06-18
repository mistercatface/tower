import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay } from "../../Pathfinding/hpaPathSlot.js";
import { getRollToCursorConfig, snapRollMoveTargetToCellCenter, steerRollToward, releaseRollMoveTarget } from "../rollToCursorMotion.js";
import { isEntityOnFloorBelt, isFloorBeltCell, resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
import { stopLocomotionWorldProp } from "../../Props/locomotionWorldProp.js";
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @typedef {{ targetWorld: { x: number, y: number } | null, targetCellCol: number | null, targetCellRow: number | null, dragging: boolean, wasOnBelt: boolean, hpaNav: ReturnType<typeof createRollToCursorHpaNav> }} HpaPropRun */
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior(state) {
    /** @type {Map<number, HpaPropRun>} */
    const propRuns = new Map();
    /** @param {object} prop @returns {HpaPropRun} */
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, targetCellCol: null, targetCellRow: null, dragging: false, wasOnBelt: false, hpaNav: createRollToCursorHpaNav() };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    /** @param {HpaPropRun} run */
    const clearRunTarget = (run, state) => {
        run.targetWorld = null;
        run.targetCellCol = null;
        run.targetCellRow = null;
        run.dragging = false;
        run.wasOnBelt = false;
        run.hpaNav.reset(state);
    };
    /** @param {object} prop @param {HpaPropRun} run */
    const releaseMoveTarget = (prop, run) => {
        clearRunTarget(run, state);
        releaseRollMoveTarget(prop);
    };
    /** @param {HpaPropRun} run @param {{ x: number, y: number }} world @param {boolean} [forceReset] */
    const applyMoveTarget = (run, world, forceReset = false) => {
        const snapped = snapRollMoveTargetToCellCenter(state.obstacleGrid, world);
        const cellChanged = snapped.col !== run.targetCellCol || snapped.row !== run.targetCellRow;
        run.targetWorld = snapped.world;
        run.targetCellCol = snapped.col;
        run.targetCellRow = snapped.row;
        if (forceReset || cellChanged) run.hpaNav.markTargetChanged();
    };
    /** @param {object} prop @param {HpaPropRun} run @param {number} dt */
    const tickProp = (prop, run, dt) => {
        if (!run.targetWorld) return;
        const grid = state.obstacleGrid;
        const config = getRollToCursorConfig(prop, { stopRadius: 8 });
        const onBelt = isEntityOnFloorBelt(grid, prop.x, prop.y);
        const targetOnBelt = isFloorBeltCell(grid, run.targetCellCol, run.targetCellRow);
        const steerTarget = resolveFloorBeltSteerTarget(grid, run.targetWorld.x, run.targetWorld.y, prop.x, prop.y);
        const distToTarget = Math.hypot(run.targetWorld.x - prop.x, run.targetWorld.y - prop.y);
        if (distToTarget <= config.stopRadius && (!targetOnBelt || onBelt)) {
            releaseMoveTarget(prop, run);
            return;
        }
        if (onBelt) {
            run.wasOnBelt = true;
            stopLocomotionWorldProp(prop);
            return;
        }
        if (run.wasOnBelt) {
            run.wasOnBelt = false;
            run.hpaNav.reset(state);
            run.hpaNav.replan(prop, steerTarget.x, steerTarget.y, state);
        }
        if (prop._navPathStale) {
            prop._navPathStale = false;
            run.hpaNav.reset(state);
            run.hpaNav.replan(prop, steerTarget.x, steerTarget.y, state);
        } else run.hpaNav.update(prop, steerTarget.x, steerTarget.y, state, dt * 1000);
        const steering = run.hpaNav.getSteering(
            prop,
            steerTarget.x,
            steerTarget.y,
            { pathWaypointArrival: Math.max(12, (prop.radius ?? 6) * 1.5), arrivalDistance: config.stopRadius, pathOffPathDistance: 80 },
            state.obstacleGrid,
            state.hpaPathWorker,
        );
        if (!steering) return;
        if (steering.desiredX === 0 && steering.desiredY === 0) return;
        steerRollToward(prop, steering.desiredX, steering.desiredY, dt, config);
    };
    return {
        id: ROLL_TO_CURSOR_HPA_BEHAVIOR_ID,
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
        setGroundMoveTarget(prop, world) {
            const run = getRun(prop);
            run.dragging = false;
            applyMoveTarget(run, world, true);
        },
        updateGroundMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            applyMoveTarget(run, world);
        },
        tick(prop, dt) {
            tickProp(prop, getRun(prop), dt);
        },
        tickWorld(dt) {
            propRuns.forEach((run, propId) => {
                if (!run.targetWorld) return;
                const prop = state.entityRegistry.getLive(propId);
                if (!prop) {
                    propRuns.delete(propId);
                    return;
                }
                tickProp(prop, run, dt);
            });
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            if (!run?.targetWorld) return null;
            const grid = state.obstacleGrid;
            if (isEntityOnFloorBelt(grid, prop.x, prop.y))
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
                    ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.hpaPathWorker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid)
                    : { pathNodes: [] };
            const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.hpaPathWorker, nav.pathSlot, nav.pathLen, state.obstacleGrid) : null;
            return { mode: "hpa", pathNodes: trace.pathNodes, targetX: run.targetWorld.x, targetY: run.targetWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
        },
        reset() {
            propRuns.forEach((run) => run.hpaNav.reset(state));
            propRuns.clear();
        },
    };
}
