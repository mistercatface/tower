import { getPhysicsSettings } from "../../../Core/GamePhysicsSettings.js";
import { navHasPath } from "../../Pathfinding/navSession.js";
import { REPLAN_PRIORITY_TARGET } from "../../Pathfinding/hpaReplanPolicy.js";
import { buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay } from "../../Pathfinding/hpaPathSlot.js";
import { createHpaGroundNavSession } from "./hpaGroundNavSession.js";
import { buildHpaGroundNavPathSettings, driveGroundNav } from "./driveGroundNav.js";
import { decelerateRoll, getKineticRollConfig, steerRollToward, clearGroundRollDrive } from "../kineticRollActuator.js";
import { isEntityOnFloorBelt, isFloorBeltCell } from "../../Spatial/grid/FloorCell.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
export function cellTargetHasArrivedAtDestCell(grid, col, row, destCol, destRow) {
    if (isFloorBeltCell(grid, destCol, destRow)) return col === destCol && row === destRow;
    return cellChebyshevDistance(col, row, destCol, destRow) <= 1;
}
export function createCellTargetLocomotion(headNav) {
    const hasArrivedAtDest = (agent, grid) => {
        const dest = headNav.getDestination();
        if (!dest) return false;
        const cell = grid.worldToGrid(agent.x, agent.y);
        return cellTargetHasArrivedAtDestCell(grid, cell.col, cell.row, dest.col, dest.row);
    };
    const hasReachedDest = (agent, grid) => {
        const dest = headNav.getDestination();
        if (!dest) return false;
        if (hasArrivedAtDest(agent, grid)) return true;
        if (!dest.world) return false;
        const stopRadius = Math.max(agent.radius, 2) * 2;
        return Math.hypot(agent.x - dest.world.x, agent.y - dest.world.y) <= stopRadius;
    };
    return {
        setExplore(agent, state, cell) {
            headNav.setDestination(state.obstacleGrid, cell.col, cell.row);
        },
        setSeek(agent, state, target) {
            const cell = state.obstacleGrid.worldToGrid(target.x, target.y);
            headNav.setDestination(state.obstacleGrid, cell.col, cell.row);
        },
        setFlee(agent, state, cell) {
            headNav.setDestination(state.obstacleGrid, cell.col, cell.row);
        },
        clearDestination(_agent, _state) {
            headNav.clearDestination();
        },
        getDestination() {
            return headNav.getDestination();
        },
        needsRetry(_agent, _state) {
            return headNav.needsRetry();
        },
        getStatus(_agent, _state) {
            return headNav.getStatus();
        },
        tick(agent, dtMs, _state) {
            headNav.tick(agent, dtMs);
        },
        clear(agent, _state) {
            headNav.clear(agent);
        },
        hasArrivedAtDest,
        hasReachedDest,
        retryOnRouteFailure(mode, { fleeMode, exploreMode }) {
            return mode === exploreMode || mode === fleeMode;
        },
        hasMoveTarget(_agent, _state) {
            const dest = headNav.getDestination();
            if (!dest) return false;
            const status = headNav.getStatus();
            return status.hasRoute || status.replanPending;
        },
    };
}
export function createCellTargetHpaNav(state) {
    let destCol = null;
    let destRow = null;
    let destWorld = null;
    let wasOnBelt = false;
    const hpaNav = createHpaGroundNavSession();
    const resetSession = () => {
        wasOnBelt = false;
        hpaNav.reset(state);
    };
    const clearDestination = () => {
        destCol = null;
        destRow = null;
        destWorld = null;
        resetSession();
    };
    const setDestination = (grid, col, row) => {
        const changed = destCol !== col || destRow !== row;
        destCol = col;
        destRow = row;
        destWorld = grid.gridToWorld(col, row);
        if (changed) hpaNav.markTargetChanged();
        return changed;
    };
    const needsRetry = () => {
        if (destCol == null) return true;
        if (hpaNav.isRoutePending()) return false;
        return !navHasPath(hpaNav.navState);
    };
    const replan = (prop) => {
        if (!destWorld) return;
        hpaNav.replan(prop, destWorld.x, destWorld.y, state, REPLAN_PRIORITY_TARGET);
    };
    /** @param {number} dtMs */
    const tick = (prop, dtMs) => {
        if (destCol == null || !destWorld) return;
        if (needsRetry()) replan(prop);
        const config = getKineticRollConfig(prop, { stopRadius: getPhysicsSettings().groundNavHpa.stopRadius });
        const { vx, vy, steering, beltWasOnBelt } = driveGroundNav({
            prop,
            targetWorld: destWorld,
            targetCellCol: destCol,
            targetCellRow: destRow,
            nav: hpaNav,
            beltWasOnBelt: wasOnBelt,
            state,
            dtMs: dtMs,
            pathSettings: buildHpaGroundNavPathSettings(state, prop, config.stopRadius),
        });
        wasOnBelt = beltWasOnBelt;
        if (!steering) return;
        if (vx === 0 && vy === 0) {
            decelerateRoll(prop, config);
            return;
        }
        steerRollToward(prop, vx, vy, config);
    };
    const getStatus = () => {
        const nav = hpaNav.navState;
        return { hasDest: destCol != null, destCol, destRow, hasRoute: navHasPath(nav), replanPending: hpaNav.isRoutePending(), stuckFrames: nav.stuckFrames, pathLen: nav.pathLen };
    };
    const getPathOverlay = (prop) => {
        if (destCol == null || !destWorld) return null;
        const grid = state.obstacleGrid;
        if (isEntityOnFloorBelt(grid, prop.x, prop.y))
            return {
                mode: "direct",
                pathNodes: [
                    { x: prop.x, y: prop.y },
                    { x: destWorld.x, y: destWorld.y },
                ],
                targetX: destWorld.x,
                targetY: destWorld.y,
            };
        const nav = hpaNav.navState;
        const progressIdx = nav.pathProgressIdx;
        const trace =
            nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.nav.worker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid) : { pathNodes: [] };
        const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.nav.worker, nav.pathSlot, nav.pathLen, state.obstacleGrid) : null;
        return { mode: "hpa", pathNodes: trace.pathNodes, targetX: destWorld.x, targetY: destWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
    };
    return {
        getDestination() {
            if (destCol == null || destRow == null) return null;
            return { col: destCol, row: destRow, world: destWorld };
        },
        setDestination,
        clearDestination,
        clear(prop) {
            if (prop) clearGroundRollDrive(prop);
            clearDestination();
        },
        needsRetry,
        replan,
        tick,
        getStatus,
        getPathOverlay,
    };
}
