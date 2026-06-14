import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { buildPathOverlayFromProgress } from "../../Pathfinding/pathFollow.js";
import { getRollToCursorConfig, steerRollToward, releaseRollMoveTarget } from "../rollToCursorMotion.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {{ x: number, y: number }} world */
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
            if (prop._portalNavDirty) {
                prop._portalNavDirty = false;
                hpaNav.reset();
            }
            const config = getRollToCursorConfig(prop, { stopRadius: 8 });
            const steerTarget = resolveFloorBeltSteerTarget(state.obstacleGrid, targetWorld.x, targetWorld.y, prop.x, prop.y);
            const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
            const isFinalLeg = !hpaNav.navState.path || hpaNav.navState.pathProgressIdx >= hpaNav.navState.path.length - 1;
            if (isFinalLeg && distToTarget <= config.stopRadius) {
                releaseMoveTarget(prop);
                return;
            }
            hpaNav.update(prop, steerTarget.x, steerTarget.y, state, dt * 1000);
            const steering = hpaNav.getSteering(prop, steerTarget.x, steerTarget.y, {
                pathWaypointArrival: Math.max(12, (prop.radius ?? 6) * 1.5),
                arrivalDistance: config.stopRadius,
                pathOffPathDistance: 80,
            });
            if (!steering) {
                releaseMoveTarget(prop);
                return;
            }
            if (steering.desiredX === 0 && steering.desiredY === 0) {
                if (distToTarget <= config.stopRadius) releaseMoveTarget(prop);
                return;
            }
            steerRollToward(prop, steering.desiredX, steering.desiredY, dt, config);
        },
        getPathOverlay(prop) {
            if (!targetWorld) return null;
            const trace = buildPathOverlayFromProgress(prop.x, prop.y, prop.radius ?? 6, hpaNav.navState.path, hpaNav.navState.pathProgressIdx, targetWorld.x, targetWorld.y);
            return {
                mode: "hpa",
                fromX: trace.fromX,
                fromY: trace.fromY,
                targetX: targetWorld.x,
                targetY: targetWorld.y,
                waypoints: trace.waypoints,
                abstractPath: hpaNav.navState.abstractPath ?? undefined,
                pathPlanner: hpaNav.navState.pathPlanner ?? undefined,
            };
        },
        reset() {
            clearTarget();
        },
    };
}
