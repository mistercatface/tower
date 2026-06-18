import { agentPose } from "../../Agent/index.js";
import { createNavState } from "../../Pathfinding/navSession.js";
import { clearHpaNavPath } from "../../Pathfinding/hpaPathPlan.js";
import { computeSabPathSteering } from "../../Pathfinding/hpaPathSlot.js";
import {
    sandboxReplanDue,
    buildReplanParams,
    obstacleEpochReplanDue,
    trackNavStuck,
    idlePathReplanReason,
    idlePathReplanAllowed,
    offPathReplanDue,
} from "../../Pathfinding/hpaReplanPolicy.js";
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
        navState.stuckFrames = 0;
        navState.lastX = null;
        navState.lastY = null;
        navState.lastOffPathReplan = 0;
        replanClockMs = 0;
    };
    const markTargetChanged = () => {
        pendingTargetReplan = true;
    };
    const replan = (prop, targetX, targetY, state) => {
        state.hpaPathSession.requestReplan(navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, state.navigation.obstacleGeneration, replanClockMs));
    };
    const requestReplan = (prop, targetX, targetY, state) => {
        pendingTargetReplan = false;
        navState.stuckFrames = 0;
        replan(prop, targetX, targetY, state);
    };
    const update = (prop, targetX, targetY, state, dtMs, pathSettings) => {
        replanClockMs += dtMs;
        const settings = state.navigation.settings;
        trackNavStuck(navState, prop.x, prop.y, settings.stuckMoveThreshold);
        const inFlight = state.hpaPathSession.isReplanInFlight(navState);
        const graphEpoch = state.navigation.obstacleGeneration;
        if (obstacleEpochReplanDue(navState, graphEpoch)) {
            if (navHasPath(navState)) clearHpaNavPath(navState, state.hpaPathWorker);
            requestReplan(prop, targetX, targetY, state);
            return null;
        }
        if (sandboxReplanDue(navState, pendingTargetReplan, inFlight, targetX, targetY)) {
            requestReplan(prop, targetX, targetY, state);
            return null;
        }
        const idleReason = idlePathReplanReason(navState, settings, false, inFlight);
        if (idleReason === "stuck" && idlePathReplanAllowed(navState, idleReason, true, settings.stuckReplanFrames)) {
            requestReplan(prop, targetX, targetY, state);
            return null;
        }
        if (!state.hpaPathWorker || !navHasPath(navState)) return null;
        const steering = computeSabPathSteering(agentPose(prop), state.hpaPathWorker, navState.pathSlot, navState.pathLen, targetX, targetY, state.obstacleGrid, pathSettings, navState);
        if (steering && !inFlight && offPathReplanDue(steering, navState, replanClockMs)) {
            navState.lastOffPathReplan = replanClockMs;
            requestReplan(prop, targetX, targetY, state);
            return null;
        }
        return steering;
    };
    return { navState, reset, markTargetChanged, replan, update };
}
