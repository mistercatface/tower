import { agentPose } from "../../Agent/index.js";
import { createNavState } from "../../Pathfinding/navSession.js";
import { clearHpaNavPath } from "../../Pathfinding/hpaPathPlan.js";
import { computeSabPathSteering } from "../../Pathfinding/hpaPathSlot.js";
import { sandboxReplanDue, buildReplanParams, obstacleEpochReplanDue } from "../../Pathfinding/hpaReplanPolicy.js";
import { navHasPath } from "../../Pathfinding/navSession.js";
export function createHpaGroundNavSession() {
    const navState = createNavState();
    let replanClockMs = 0;
    let pendingTargetReplan = false;
    const reset = (state) => {
        pendingTargetReplan = false;
        clearHpaNavPath(navState, state.hpaPathWorker);
        navState.pathProgressIdx = 0;
        navState.obstacleGeneration = -1;
        navState.lastTargetX = null;
        navState.lastTargetY = null;
        navState.lastUpdate = 0;
        navState.hpaReplanRequestId = 0;
        replanClockMs = 0;
    };
    const markTargetChanged = () => {
        pendingTargetReplan = true;
    };
    const replan = (prop, targetX, targetY, state) => {
        state.hpaPathSession.requestReplan(navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, state.navigation.obstacleGeneration, replanClockMs));
    };
    const update = (prop, targetX, targetY, state, dtMs) => {
        replanClockMs += dtMs;
        const inFlight = state.hpaPathSession.isReplanInFlight(navState);
        const graphEpoch = state.navigation.obstacleGeneration;
        if (obstacleEpochReplanDue(navState, graphEpoch)) {
            if (navHasPath(navState)) clearHpaNavPath(navState, state.hpaPathWorker);
            pendingTargetReplan = false;
            replan(prop, targetX, targetY, state);
            return;
        }
        if (sandboxReplanDue(navState, pendingTargetReplan, inFlight, targetX, targetY)) {
            pendingTargetReplan = false;
            replan(prop, targetX, targetY, state);
        }
    };
    const getSteering = (prop, targetX, targetY, settings, grid, worker) => {
        if (!worker || !navHasPath(navState)) return null;
        return computeSabPathSteering(agentPose(prop), worker, navState.pathSlot, navState.pathLen, targetX, targetY, grid, settings, navState);
    };
    return { navState, reset, markTargetChanged, replan, update, getSteering };
}
