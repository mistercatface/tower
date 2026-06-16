import { agentPose } from "../Agent/index.js";
import { createNavState } from "../Pathfinding/navSession.js";
import { clearHpaNavPath } from "../Pathfinding/hpaPathPlan.js";
import { computeSabPathSteering } from "../Pathfinding/hpaPathSlot.js";
import { navHasPath } from "../Pathfinding/navSession.js";
/** @typedef {import("../Pathfinding/navSession.js").NavSessionState} NavSessionState */
const REPLAN_TARGET_MOVE_PX = 64;
/** @returns {{ navState: NavSessionState, reset: () => void, markTargetChanged: () => void, replan: (prop: object, targetX: number, targetY: number, state: object) => void, update: (prop: object, targetX: number, targetY: number, state: object, dtMs: number) => void, getSteering: (prop: object, targetX: number, targetY: number, settings: object, grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid) => import("../Agent/types.js").SteeringResult | null }} */
export function createRollToCursorHpaNav() {
    const navState = createNavState();
    let replanClockMs = 0;
    let pendingTargetReplan = false;
    const reset = (state) => {
        pendingTargetReplan = false;
        clearHpaNavPath(navState, state.hpaPathWorker);
        navState.pathProgressIdx = 0;
        navState.lastTargetX = null;
        navState.lastTargetY = null;
        navState.lastUpdate = 0;
        navState.hpaReplanRequestId = 0;
        replanClockMs = 0;
    };
    /** New target cell — one replan when idle; keep path steering until apply. */
    const markTargetChanged = () => {
        pendingTargetReplan = true;
    };
    const replan = (prop, targetX, targetY, state) => {
        state.hpaPathSession.requestReplan(navState, {
            obstacleGrid: state.obstacleGrid,
            startX: prop.x,
            startY: prop.y,
            targetX,
            targetY,
            nowMs: replanClockMs,
            graphEpoch: state.navigation.obstacleGeneration,
        });
    };
    const update = (prop, targetX, targetY, state, dtMs) => {
        replanClockMs += dtMs;
        if (state.hpaPathSession.isReplanInFlight(navState)) return;
        if (pendingTargetReplan) {
            pendingTargetReplan = false;
            replan(prop, targetX, targetY, state);
            return;
        }
        const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
        if (!navState.pathLen) replan(prop, targetX, targetY, state);
        else if (targetMovedPx >= REPLAN_TARGET_MOVE_PX) replan(prop, targetX, targetY, state);
    };
    const getSteering = (prop, targetX, targetY, settings, grid, worker) => {
        if (!worker || !navHasPath(navState)) return null;
        return computeSabPathSteering(agentPose(prop), worker, navState.pathSlot, navState.pathLen, targetX, targetY, { ...settings, grid }, navState);
    };
    return { navState, reset, markTargetChanged, replan, update, getSteering };
}
