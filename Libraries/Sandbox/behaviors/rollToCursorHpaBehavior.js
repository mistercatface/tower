import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { buildSabPathOverlayFromProgress } from "../../Pathfinding/hpaPathSlot.js";
import { clearCrossingGrantOnEntity, refreshNavCrossingGrant, syncCrossingGrantToEntity } from "../../Pathfinding/crossingGrant.js";
import { getRollToCursorConfig, snapRollMoveTargetToCellCenter, steerRollToward, releaseRollMoveTarget } from "../rollToCursorMotion.js";
import { resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @typedef {{ targetWorld: { x: number, y: number } | null, targetCellCol: number | null, targetCellRow: number | null, dragging: boolean, hpaNav: ReturnType<typeof createRollToCursorHpaNav> }} HpaPropRun */
/** @param {object} state @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior(state) {
    /** @type {Map<number, HpaPropRun>} */
    const propRuns = new Map();
    /** @param {object} prop @returns {HpaPropRun} */
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, targetCellCol: null, targetCellRow: null, dragging: false, hpaNav: createRollToCursorHpaNav() };
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
        run.hpaNav.reset(state);
    };
    /** @param {object} prop @param {HpaPropRun} run */
    const releaseMoveTarget = (prop, run) => {
        clearRunTarget(run, state);
        clearCrossingGrantOnEntity(prop);
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
        const config = getRollToCursorConfig(prop, { stopRadius: 8 });
        const steerTarget = resolveFloorBeltSteerTarget(state.obstacleGrid, run.targetWorld.x, run.targetWorld.y, prop.x, prop.y);
        if (prop._navPathStale) {
            prop._navPathStale = false;
            run.hpaNav.reset(state);
            run.hpaNav.replan(prop, steerTarget.x, steerTarget.y, state);
        } else run.hpaNav.update(prop, steerTarget.x, steerTarget.y, state, dt * 1000);
        const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
        const pathTail = run.hpaNav.navState.pathLen > 0 ? run.hpaNav.navState.pathLen - 1 : (run.hpaNav.navState.path?.length ?? 0) - 1;
        const isFinalLeg = pathTail < 0 || run.hpaNav.navState.pathProgressIdx >= pathTail;
        if (isFinalLeg && distToTarget <= config.stopRadius) {
            releaseMoveTarget(prop, run);
            return;
        }
        const steering = run.hpaNav.getSteering(
            prop,
            steerTarget.x,
            steerTarget.y,
            { pathWaypointArrival: Math.max(12, (prop.radius ?? 6) * 1.5), arrivalDistance: config.stopRadius, pathOffPathDistance: 80 },
            state.obstacleGrid,
            state.hpaPathWorker,
        );
        refreshNavCrossingGrant(run.hpaNav.navState, state.obstacleGrid, state.hpaPathWorker);
        syncCrossingGrantToEntity(prop, run.hpaNav.navState);
        if (!steering) return;
        if (steering.desiredX === 0 && steering.desiredY === 0) {
            if (distToTarget <= config.stopRadius) releaseMoveTarget(prop, run);
            return;
        }
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
            const hopIdx = run.hpaNav.navState.boundaryHopIdx;
            let progressIdx = run.hpaNav.navState.pathProgressIdx;
            if (hopIdx != null && progressIdx > hopIdx) progressIdx = hopIdx;
            const trace =
                run.hpaNav.navState.pathLen > 0 && run.hpaNav.navState.pathSlot >= 0
                    ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.hpaPathWorker, run.hpaNav.navState.pathSlot, run.hpaNav.navState.pathLen, progressIdx, state.obstacleGrid, hopIdx)
                    : { pathNodes: run.hpaNav.navState.path?.slice(progressIdx) ?? [] };
            return {
                mode: "hpa",
                pathNodes: trace.pathNodes,
                targetX: run.targetWorld.x,
                targetY: run.targetWorld.y,
                abstractPath: run.hpaNav.navState.abstractPath ?? undefined,
                pathPlanner: run.hpaNav.navState.pathPlanner ?? undefined,
            };
        },
        reset() {
            propRuns.forEach((run, propId) => {
                const prop = state.entityRegistry.getLive(propId);
                if (prop) clearCrossingGrantOnEntity(prop);
                run.hpaNav.reset(state);
            });
            propRuns.clear();
        },
    };
}
