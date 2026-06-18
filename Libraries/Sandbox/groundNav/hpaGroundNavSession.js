import { agentPose } from "../../Agent/index.js";
import { createNavState } from "../../Pathfinding/navSession.js";
import { clearHpaNavPath } from "../../Pathfinding/hpaPathPlan.js";
import { computeSabPathSteering } from "../../Pathfinding/hpaPathSlot.js";
import {
    buildReplanParams,
    obstacleEpochReplanDue,
    obstacleReplanAllowed,
    trackNavStuck,
    idlePathReplanReason,
    idlePathReplanAllowed,
    offPathReplanDue,
    sandboxReplanReason,
    sandboxReplanAllowed,
    replanPriorityFor,
    REPLAN_PRIORITY_TARGET,
} from "../../Pathfinding/hpaReplanPolicy.js";
import { navHasPath } from "../../Pathfinding/navSession.js";
function isPropNavVisible(state, prop) {
    return state.viewport.isVisible(prop.x, prop.y, prop.radius);
}
export function createHpaGroundNavSession() {
    const navState = createNavState();
    let replanClockMs = 0;
    let pendingTargetReplan = false;
    const reset = (state) => {
        pendingTargetReplan = false;
        clearHpaNavPath(navState, state.hpaPathWorker);
        Object.assign(navState, createNavState());
        replanClockMs = 0;
    };
    const markTargetChanged = () => {
        pendingTargetReplan = true;
    };
    const replan = (prop, targetX, targetY, state, priority = REPLAN_PRIORITY_TARGET) => {
        state.hpaPathSession.requestReplan(navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, state.navigation.obstacleGeneration), priority);
    };
    const requestReplan = (prop, targetX, targetY, state, priority) => {
        pendingTargetReplan = false;
        navState.stuckFrames = 0;
        replan(prop, targetX, targetY, state, priority);
    };
    const update = (prop, targetX, targetY, state, dtMs, pathSettings) => {
        replanClockMs += dtMs;
        const settings = state.navigation.settings;
        trackNavStuck(navState, prop.x, prop.y, settings.stuckMoveThreshold);
        const inFlight = state.hpaPathSession.isReplanInFlight(navState);
        const isVisible = isPropNavVisible(state, prop);
        const stuckFrames = navState.stuckFrames;
        const stuckReplanFrames = settings.stuckReplanFrames;
        const graphEpoch = state.navigation.obstacleGeneration;
        if (obstacleEpochReplanDue(navState, graphEpoch))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                if (navHasPath(navState)) clearHpaNavPath(navState, state.hpaPathWorker);
                requestReplan(prop, targetX, targetY, state, replanPriorityFor("epoch", isVisible));
                return null;
            }
        const sandboxReason = sandboxReplanReason(navState, pendingTargetReplan, inFlight, targetX, targetY);
        if (sandboxReason && sandboxReplanAllowed(sandboxReason, isVisible, stuckFrames, stuckReplanFrames)) {
            requestReplan(prop, targetX, targetY, state, replanPriorityFor(sandboxReason, isVisible));
            return null;
        }
        const idleReason = idlePathReplanReason(navState, settings, inFlight);
        if (idleReason && idlePathReplanAllowed(navState, idleReason, isVisible, stuckReplanFrames)) {
            requestReplan(prop, targetX, targetY, state, replanPriorityFor(idleReason, isVisible));
            return null;
        }
        if (!navHasPath(navState)) return null;
        const steering = computeSabPathSteering(agentPose(prop), state.hpaPathWorker, navState.pathSlot, navState.pathLen, targetX, targetY, state.obstacleGrid, pathSettings, navState);
        if (steering && !inFlight && offPathReplanDue(steering, navState, replanClockMs))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                navState.lastOffPathReplan = replanClockMs;
                requestReplan(prop, targetX, targetY, state, replanPriorityFor("offPath", isVisible));
                return null;
            }
        return steering;
    };
    return { navState, reset, markTargetChanged, replan, update };
}
