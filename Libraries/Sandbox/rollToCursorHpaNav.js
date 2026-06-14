import { agentPose } from "../Agent/index.js";
import { createNavState } from "../Pathfinding/navSession.js";
import { computePathSteering, trimPathAhead } from "../Pathfinding/pathFollow.js";
import { expandPortalHopsInCellPath, portalHopMouthOnCellPath } from "./portalNavIndex.js";
/** @typedef {import("../Pathfinding/navSession.js").NavSessionState} NavSessionState */
const REPLAN_TARGET_MOVE_PX = 64;
/** @returns {{ navState: NavSessionState & { portalHopMouth: { col: number, row: number } | null }, reset: () => void, update: (prop: object, targetX: number, targetY: number, state: object, dtMs: number) => void, getSteering: (prop: object, targetX: number, targetY: number, settings: object) => import("../Agent/types.js").SteeringResult | null }} */
export function createRollToCursorHpaNav() {
    const navState = createNavState();
    /** @type {{ col: number, row: number } | null} */
    navState.portalHopMouth = null;
    let replanClockMs = 0;
    const reset = () => {
        navState.path = null;
        navState.abstractPath = null;
        navState.pathPlanner = null;
        navState.portalHopMouth = null;
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
            navState.portalHopMouth = null;
            return;
        }
        const result = computeCellPath(prop.x, prop.y, targetX, targetY);
        if (!result) {
            navState.path = null;
            navState.abstractPath = null;
            navState.pathPlanner = null;
            navState.portalHopMouth = null;
            return;
        }
        const grid = state.obstacleGrid;
        const expandedCells = expandPortalHopsInCellPath(result.cellPath, grid);
        const rawPath = expandedCells.map((cell) => grid.gridToWorld(cell.col, cell.row));
        navState.path = trimPathAhead(prop.x, prop.y, rawPath);
        navState.abstractPath = navState.path ? (result.abstractNodes ?? null) : null;
        navState.pathPlanner = navState.path ? (result.pathPlanner ?? null) : null;
        navState.portalHopMouth = portalHopMouthOnCellPath(result.cellPath, grid);
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
    const getSteering = (prop, targetX, targetY, settings) => {
        if (!navState.path || navState.path.length < 2) return null;
        return computePathSteering(agentPose(prop), navState.path, targetX, targetY, settings, navState);
    };
    return { navState, reset, update, getSteering };
}
