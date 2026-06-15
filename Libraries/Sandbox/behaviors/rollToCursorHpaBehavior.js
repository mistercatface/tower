import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { buildSabPathOverlayFromProgress } from "../../Pathfinding/hpaPathSlot.js";
import { clearCrossingGrantOnEntity, refreshNavCrossingGrant, syncCrossingGrantToEntity } from "../../Pathfinding/crossingGrant.js";
import { getRollToCursorConfig, snapRollMoveTargetToCellCenter, steerRollToward, releaseRollMoveTarget } from "../rollToCursorMotion.js";
import { resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @param {object} state @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior(state) {
    let targetWorld = null;
    let targetCellCol = null;
    let targetCellRow = null;
    let dragging = false;
    const hpaNav = createRollToCursorHpaNav();
    const clearTarget = () => {
        targetWorld = null;
        targetCellCol = null;
        targetCellRow = null;
        dragging = false;
        hpaNav.reset(state);
    };
    const releaseMoveTarget = (prop) => {
        clearTarget();
        clearCrossingGrantOnEntity(prop);
        releaseRollMoveTarget(prop);
    };
    /** @param {{ x: number, y: number }} world @param {boolean} [forceReset] */
    const applyMoveTarget = (world, forceReset = false) => {
        const snapped = snapRollMoveTargetToCellCenter(state.obstacleGrid, world);
        const cellChanged = snapped.col !== targetCellCol || snapped.row !== targetCellRow;
        targetWorld = snapped.world;
        targetCellCol = snapped.col;
        targetCellRow = snapped.row;
        if (forceReset || cellChanged) hpaNav.markTargetChanged();
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
                hpaNav.reset(state);
                hpaNav.replan(prop, steerTarget.x, steerTarget.y, state);
            } else hpaNav.update(prop, steerTarget.x, steerTarget.y, state, dt * 1000);
            const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
            const pathTail = hpaNav.navState.pathLen > 0 ? hpaNav.navState.pathLen - 1 : (hpaNav.navState.path?.length ?? 0) - 1;
            const isFinalLeg = pathTail < 0 || hpaNav.navState.pathProgressIdx >= pathTail;
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
                state.hpaPathWorker,
            );
            refreshNavCrossingGrant(hpaNav.navState, state.obstacleGrid, state.hpaPathWorker);
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
            const trace =
                hpaNav.navState.pathLen > 0 && hpaNav.navState.pathSlot >= 0
                    ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.hpaPathWorker, hpaNav.navState.pathSlot, hpaNav.navState.pathLen, progressIdx, state.obstacleGrid)
                    : { pathNodes: hpaNav.navState.path?.slice(progressIdx) ?? [] };
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
