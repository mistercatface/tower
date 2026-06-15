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
}
export function applyHpaReplanResult(navState, result, { obstacleGrid, startX, startY, targetX, targetY, nowMs }) {
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
