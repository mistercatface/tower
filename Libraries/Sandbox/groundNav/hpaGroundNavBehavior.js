import { createHpaGroundNavSession } from "./hpaGroundNavSession.js";
import { buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay } from "../../Pathfinding/hpaPathSlot.js";
import { getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward, clearMoveTarget } from "../kineticRollActuator.js";
import { isEntityOnFloorBelt, isFloorBeltCell, resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "./groundNavIds.js";
export function createHpaGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, targetCellCol: null, targetCellRow: null, dragging: false, wasOnBelt: false, hpaNav: createHpaGroundNavSession() };
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
        run.hpaNav.reset(state);
    };
    const releaseMoveTarget = (prop, run) => {
        clearRunTarget(run, state);
        clearMoveTarget(prop);
    };
    const applyMoveTarget = (run, world, forceReset = false) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        const cellChanged = snapped.col !== run.targetCellCol || snapped.row !== run.targetCellRow;
        run.targetWorld = snapped.world;
        run.targetCellCol = snapped.col;
        run.targetCellRow = snapped.row;
        if (forceReset || cellChanged) run.hpaNav.markTargetChanged();
    };
    const tickProp = (prop, run, dt) => {
        if (!run.targetWorld) return;
        const grid = state.obstacleGrid;
        const config = getKineticRollConfig(prop, { stopRadius: 8 });
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
            return;
        }
        if (run.wasOnBelt) {
            run.wasOnBelt = false;
            run.hpaNav.reset(state);
            run.hpaNav.replan(prop, steerTarget.x, steerTarget.y, state);
        } else run.hpaNav.update(prop, steerTarget.x, steerTarget.y, state, dt * 1000);
        const steering = run.hpaNav.getSteering(
            prop,
            steerTarget.x,
            steerTarget.y,
            { ...state.navigation.settings, pathWaypointArrival: Math.max(12, (prop.radius ?? 6) * 1.5), arrivalDistance: config.stopRadius },
            state.obstacleGrid,
            state.hpaPathWorker,
        );
        if (!steering) return;
        if (steering.desiredX === 0 && steering.desiredY === 0) return;
        steerRollToward(prop, steering.desiredX, steering.desiredY, dt, config);
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
