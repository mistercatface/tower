import { expandBoundaryHopsInCellPath, boundaryHopWaypointIndex } from "./boundaryNavHops.js";
import { findPathProgressIdx } from "./pathFollow.js";
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HierarchicalNavigator.js").HierarchicalNavigator} HierarchicalNavigator */
/** @typedef {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/** @param {NavSessionState} navState */
export function clearHpaNavPath(navState) {
    navState.path = null;
    navState.abstractPath = null;
    navState.pathPlanner = null;
    navState.boundaryHopIdx = null;
    navState.navPathActive = false;
    navState.crossingGrant = null;
}
/**
 * @param {{
 *   hierarchicalNavigator: HierarchicalNavigator | null | undefined,
 *   navState: NavSessionState,
 *   obstacleGrid: WorldObstacleGrid,
 *   startX: number,
 *   startY: number,
 *   targetX: number,
 *   targetY: number,
 *   nowMs: number,
 * }} params
 * @returns {Promise<{ cellPath: { col: number, row: number }[], worldPath: { x: number, y: number }[], abstractNodes: { x: number, y: number, id?: string }[] | null, pathPlanner: string | null } | null>}
 */
export async function replanHpaNavPath({ hierarchicalNavigator, navState, obstacleGrid, startX, startY, targetX, targetY, nowMs }) {
    if (!hierarchicalNavigator?.computeCellPath) {
        clearHpaNavPath(navState);
        return null;
    }
    const result = await hierarchicalNavigator.computeCellPath(startX, startY, targetX, targetY);
    if (!result) {
        clearHpaNavPath(navState);
        return null;
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
    return { cellPath: result.cellPath, worldPath, abstractNodes: result.abstractNodes ?? null, pathPlanner: result.pathPlanner ?? null };
}
