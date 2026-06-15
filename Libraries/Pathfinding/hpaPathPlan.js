import { expandBoundaryHopsInCellPath, boundaryHopWaypointIndex } from "./boundaryNavHops.js";
import { findPathProgressIdx } from "./pathFollow.js";
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HierarchicalNavigator.js").HierarchicalNavigator} HierarchicalNavigator */
/** @typedef {import("./HpaPathSession.js").HpaPathSession} HpaPathSession */
/** @typedef {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
export function clearHpaNavPath(navState) {
    navState.path = null;
    navState.abstractPath = null;
    navState.pathPlanner = null;
    navState.boundaryHopIdx = null;
    navState.navPathActive = false;
    navState.crossingGrant = null;
    navState.hpaStitchRequestId = 0;
}
export function applyHpaAbstractFirst(navState, result, { obstacleGrid, startX, startY, targetX, targetY, nowMs }) {
    const nodes = result.abstractNodes;
    if (!nodes?.length) return;
    const gridOpts = { worldToGrid: (wx, wy) => obstacleGrid.worldToGrid(wx, wy), grid: obstacleGrid };
    navState.path = nodes.map((node) => ({ x: node.x, y: node.y }));
    navState.pathProgressIdx = findPathProgressIdx(startX, startY, navState.path, gridOpts);
    navState.boundaryHopIdx = null;
    navState.abstractPath = nodes;
    navState.pathPlanner = result.pathPlanner ?? "hpa";
    navState.lastTargetX = targetX;
    navState.lastTargetY = targetY;
    navState.lastUpdate = nowMs;
}
export function applyHpaReplanResult(navState, result, { obstacleGrid, startX, startY, targetX, targetY, nowMs }) {
    if (!result.cellPath?.length) {
        if (result.abstractNodes?.length) applyHpaAbstractFirst(navState, result, { obstacleGrid, startX, startY, targetX, targetY, nowMs });
        else clearHpaNavPath(navState);
        return;
    }
    const gridOpts = { worldToGrid: (wx, wy) => obstacleGrid.worldToGrid(wx, wy), grid: obstacleGrid };
    const expandedCells = expandBoundaryHopsInCellPath(result.cellPath, obstacleGrid);
    const worldPath = expandedCells.map((cell) => obstacleGrid.gridToWorld(cell.col, cell.row));
    navState.path = worldPath;
    navState.pathProgressIdx = findPathProgressIdx(startX, startY, worldPath, gridOpts);
    navState.boundaryHopIdx = boundaryHopWaypointIndex(result.cellPath, worldPath, obstacleGrid);
    navState.abstractPath = worldPath.length ? (result.abstractNodes ?? null) : null;
    navState.pathPlanner = worldPath.length ? (result.pathPlanner ?? null) : null;
    navState.lastTargetX = targetX;
    navState.lastTargetY = targetY;
    navState.lastUpdate = nowMs;
}
export function requestHpaNavReplan(session, navState, { obstacleGrid, startX, startY, targetX, targetY, nowMs, graphEpoch }) {
    session.requestReplan(navState, { obstacleGrid, startX, startY, targetX, targetY, nowMs, graphEpoch });
}
