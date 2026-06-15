import { agentPose } from "../Agent/index.js";
import { createNavState } from "../Pathfinding/navSession.js";
import { clearHpaNavPath, replanHpaNavPath } from "../Pathfinding/hpaPathPlan.js";
import { computeHpaNavSteering } from "../Pathfinding/hpaSteering.js";

/** @typedef {import("../Pathfinding/navSession.js").NavSessionState} NavSessionState */
const REPLAN_TARGET_MOVE_PX = 64;

/** @returns {{ navState: NavSessionState, reset: () => void, replan: (prop: object, targetX: number, targetY: number, state: object) => void, update: (prop: object, targetX: number, targetY: number, state: object, dtMs: number) => void, getSteering: (prop: object, targetX: number, targetY: number, settings: object, grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid) => import("../Agent/types.js").SteeringResult | null }} */
export function createRollToCursorHpaNav() {
    const navState = createNavState();
    let replanClockMs = 0;
    const reset = () => {
        clearHpaNavPath(navState);
        navState.pathProgressIdx = 0;
        navState.lastTargetX = null;
        navState.lastTargetY = null;
        navState.lastUpdate = 0;
        replanClockMs = 0;
    };
    const replan = (prop, targetX, targetY, state) => {
        replanHpaNavPath({
            hierarchicalNavigator: state.hierarchicalNavigator,
            navState,
            obstacleGrid: state.obstacleGrid,
            startX: prop.x,
            startY: prop.y,
            targetX,
            targetY,
            nowMs: replanClockMs,
        });
    };
    const update = (prop, targetX, targetY, state, dtMs) => {
        replanClockMs += dtMs;
        const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
        const needsReplan = !navState.path || targetMovedPx >= REPLAN_TARGET_MOVE_PX;
        if (needsReplan) replan(prop, targetX, targetY, state);
    };
    const getSteering = (prop, targetX, targetY, settings, grid) => computeHpaNavSteering(agentPose(prop), navState, targetX, targetY, settings, grid);
    return { navState, reset, replan, update, getSteering };
}
