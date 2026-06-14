import { agentPose } from "../Agent/index.js";
import { createNavState } from "../Pathfinding/navSession.js";
import { computePathSteering, trimPathAhead } from "../Pathfinding/pathFollow.js";
import { expandPortalHopsInCellPath, portalHopWaypointIndex } from "./portalNavIndex.js";
/** @typedef {import("../Pathfinding/navSession.js").NavSessionState} NavSessionState */
const REPLAN_TARGET_MOVE_PX = 64;
/** @returns {{ navState: NavSessionState & { portalHopWaypointIdx: number | null }, reset: () => void, replan: (prop: object, targetX: number, targetY: number, state: object) => void, update: (prop: object, targetX: number, targetY: number, state: object, dtMs: number) => void, getSteering: (prop: object, targetX: number, targetY: number, settings: object, grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid) => import("../Agent/types.js").SteeringResult | null }} */
export function createRollToCursorHpaNav() {
    const navState = createNavState();
    /** @type {number | null} */
    navState.portalHopWaypointIdx = null;
    let replanClockMs = 0;
    const reset = () => {
        navState.path = null;
        navState.abstractPath = null;
        navState.pathPlanner = null;
        navState.portalHopWaypointIdx = null;
        navState.pathProgressIdx = 0;
        navState.lastTargetX = null;
        navState.lastTargetY = null;
        navState.lastUpdate = 0;
        replanClockMs = 0;
    };
    const replan = (prop, targetX, targetY, state) => {
        const computeCellPath = state.hierarchicalNavigator?.computeCellPath?.bind(state.hierarchicalNavigator);
        if (!computeCellPath) {
            navState.path = null;
            navState.abstractPath = null;
            navState.pathPlanner = null;
            navState.portalHopWaypointIdx = null;
            return;
        }
        const result = computeCellPath(prop.x, prop.y, targetX, targetY);
        if (!result) {
            navState.path = null;
            navState.abstractPath = null;
            navState.pathPlanner = null;
            navState.portalHopWaypointIdx = null;
            return;
        }
        const grid = state.obstacleGrid;
        const expandedCells = expandPortalHopsInCellPath(result.cellPath, grid);
        const rawPath = expandedCells.map((cell) => grid.gridToWorld(cell.col, cell.row));
        navState.path = trimPathAhead(prop.x, prop.y, rawPath, { worldToGrid: (wx, wy) => grid.worldToGrid(wx, wy) });
        navState.portalHopWaypointIdx = portalHopWaypointIndex(result.cellPath, navState.path, grid);
        navState.abstractPath = navState.path ? (result.abstractNodes ?? null) : null;
        navState.pathPlanner = navState.path ? (result.pathPlanner ?? null) : null;
        navState.pathProgressIdx = 0;
        navState.lastTargetX = targetX;
        navState.lastTargetY = targetY;
        navState.lastUpdate = replanClockMs;
    };
    const update = (prop, targetX, targetY, state, dtMs) => {
        replanClockMs += dtMs;
        const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
        const needsReplan = !navState.path || targetMovedPx >= REPLAN_TARGET_MOVE_PX;
        if (needsReplan) replan(prop, targetX, targetY, state);
    };
    const clampHopProgress = (hopIdx) => {
        if (hopIdx != null && navState.pathProgressIdx > hopIdx) navState.pathProgressIdx = hopIdx;
    };
    const getSteering = (prop, targetX, targetY, settings, grid) => {
        const path = navState.path;
        if (!path || path.length < 2) return null;
        const hopIdx = navState.portalHopWaypointIdx;
        clampHopProgress(hopIdx);
        if (hopIdx != null && navState.pathProgressIdx === hopIdx && hopIdx < path.length - 1) {
            const next = path[hopIdx + 1];
            const dx = next.x - prop.x;
            const dy = next.y - prop.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.01) return { desiredX: dx / dist, desiredY: dy / dist, offPath: dist > (settings.pathOffPathDistance ?? 64) };
        }
        const result = computePathSteering(agentPose(prop), path, targetX, targetY, settings, navState);
        clampHopProgress(hopIdx);
        return result;
    };
    return { navState, reset, replan, update, getSteering };
}
