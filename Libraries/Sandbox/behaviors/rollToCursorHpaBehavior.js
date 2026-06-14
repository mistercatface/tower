import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { buildPathOverlayFromProgress } from "../../Pathfinding/pathFollow.js";
import { clearCrossingGrantOnEntity, refreshNavCrossingGrant, syncCrossingGrantToEntity } from "../../Pathfinding/crossingGrant.js";
import { getRollToCursorConfig, steerRollToward, releaseRollMoveTarget } from "../rollToCursorMotion.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
/** @param {{ x: number, y: number }} world @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
function snapMoveTargetToCellCenter(grid, world) {
    const { col, row } = grid.worldToGrid(world.x, world.y);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return { world, col: null, row: null };
    return { world: grid.gridToWorld(col, row), col, row };
}
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @param {object} state @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior(state) {
    let targetWorld = null;
    /** @type {number | null} */
    let targetCellCol = null;
    /** @type {number | null} */
    let targetCellRow = null;
    let dragging = false;
    const hpaNav = createRollToCursorHpaNav();
    const clearTarget = () => {
        targetWorld = null;
        targetCellCol = null;
        targetCellRow = null;
        dragging = false;
        hpaNav.reset();
    };
    const releaseMoveTarget = (prop) => {
        clearTarget();
        clearCrossingGrantOnEntity(prop);
        releaseRollMoveTarget(prop);
    };
    /** @param {{ x: number, y: number }} world @param {boolean} [forceReset] */
    const applyMoveTarget = (world, forceReset = false) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        const cellChanged = snapped.col !== targetCellCol || snapped.row !== targetCellRow;
        targetWorld = snapped.world;
        targetCellCol = snapped.col;
        targetCellRow = snapped.row;
        if (forceReset || cellChanged) hpaNav.reset();
    };
    return {
        id: ROLL_TO_CURSOR_HPA_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            dragging = true;
            applyMoveTarget(world, true);
            return true;
        },
        onPointerMove(prop, world) {
            if (!dragging || !targetWorld) return;
            applyMoveTarget(world);
        },
        onPointerUp() {
            dragging = false;
        },
        setGroundMoveTarget(_prop, world) {
            dragging = false;
            applyMoveTarget(world, true);
        },
        updateGroundMoveTarget(_prop, world) {
            if (!targetWorld) return;
            applyMoveTarget(world);
        },
        tick(prop, dt) {
            if (!targetWorld) return;
            const config = getRollToCursorConfig(prop, { stopRadius: 8 });
            const steerTarget = resolveFloorBeltSteerTarget(state.obstacleGrid, targetWorld.x, targetWorld.y, prop.x, prop.y);
            if (prop._navPathStale) {
                prop._navPathStale = false;
                hpaNav.reset();
                hpaNav.replan(prop, steerTarget.x, steerTarget.y, state);
            } else hpaNav.update(prop, steerTarget.x, steerTarget.y, state, dt * 1000);
            const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
            const isFinalLeg = !hpaNav.navState.path || hpaNav.navState.pathProgressIdx >= hpaNav.navState.path.length - 1;
            if (isFinalLeg && distToTarget <= config.stopRadius) {
                releaseMoveTarget(prop);
                return;
            }
            const steering = hpaNav.getSteering(
                prop,
                steerTarget.x,
                steerTarget.y,
                { pathWaypointArrival: Math.max(12, (prop.radius ?? 6) * 1.5), arrivalDistance: config.stopRadius, pathOffPathDistance: 80 },
                state.obstacleGrid,
            );
            refreshNavCrossingGrant(hpaNav.navState, state.obstacleGrid);
            syncCrossingGrantToEntity(prop, hpaNav.navState);
            if (!steering) return;
            if (steering.desiredX === 0 && steering.desiredY === 0) {
                if (distToTarget <= config.stopRadius) releaseMoveTarget(prop);
                return;
            }
            steerRollToward(prop, steering.desiredX, steering.desiredY, dt, config);
        },
        getPathOverlay(prop) {
            if (!targetWorld) return null;
            const hopIdx = hpaNav.navState.boundaryHopIdx;
            let progressIdx = hpaNav.navState.pathProgressIdx;
            if (hopIdx != null && progressIdx > hopIdx) progressIdx = hopIdx;
            const trace = buildPathOverlayFromProgress(prop.x, prop.y, hpaNav.navState.path, progressIdx, state.obstacleGrid);
            return {
                mode: "hpa",
                pathNodes: trace.pathNodes,
                targetX: targetWorld.x,
                targetY: targetWorld.y,
                abstractPath: hpaNav.navState.abstractPath ?? undefined,
                pathPlanner: hpaNav.navState.pathPlanner ?? undefined,
            };
        },
        reset() {
            clearTarget();
        },
    };
}
