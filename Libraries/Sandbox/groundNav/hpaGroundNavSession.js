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
    const isRoutePending = () => pendingTargetReplan || navState.hpaReplanRequestId !== 0;
    const replan = (prop, targetX, targetY, state, priority = REPLAN_PRIORITY_TARGET) => {
        state.hpaPathSession.requestReplan(
            navState,
            buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, state.navigation.obstacleGeneration, prop.navStepPenalty, state.navigation.gridNavContext),
            priority,
        );
    };
    const requestReplan = (prop, targetX, targetY, state, priority, reason) => {
        pendingTargetReplan = false;
        navState.stuckFrames = 0;
        replan(prop, targetX, targetY, state, priority);
        return { steering: null, replanReason: reason };
    };
    const update = (prop, targetX, targetY, state, dtMs, pathSettings) => {
        replanClockMs += dtMs;
        const settings = state.navigation.settings;
        const inFlight = state.hpaPathSession.isReplanInFlight(navState);
        const routePending = pendingTargetReplan || navState.hpaReplanRequestId !== 0;
        if (inFlight || routePending) {
            navState.stuckFrames = 0;
            navState.lastX = prop.x;
            navState.lastY = prop.y;
        } else trackNavStuck(navState, prop.x, prop.y, settings.stuckMoveThreshold);
        const isVisible = state.viewport.circleInBounds(prop.x, prop.y, prop.radius, "props");
        const stuckFrames = navState.stuckFrames;
        const stuckReplanFrames = settings.stuckReplanFrames;
        const graphEpoch = state.navigation.obstacleGeneration;
        if (!inFlight && obstacleEpochReplanDue(navState, graphEpoch))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                if (navHasPath(navState)) clearHpaNavPath(navState, state.hpaPathWorker);
                return requestReplan(prop, targetX, targetY, state, replanPriorityFor("epoch", isVisible), "epoch");
            }
        const sandboxReason = sandboxReplanReason(navState, pendingTargetReplan, inFlight, targetX, targetY);
        if (sandboxReason && sandboxReplanAllowed(sandboxReason, isVisible, stuckFrames, stuckReplanFrames))
            return requestReplan(prop, targetX, targetY, state, replanPriorityFor(sandboxReason, isVisible), sandboxReason);
        const idleReason = idlePathReplanReason(navState, settings, inFlight);
        if (idleReason && idlePathReplanAllowed(navState, idleReason, isVisible, stuckReplanFrames))
            return requestReplan(prop, targetX, targetY, state, replanPriorityFor(idleReason, isVisible), idleReason);
        if (!navHasPath(navState)) return { steering: null, replanReason: routePending ? "pending" : "noPath" };
        const steering = computeSabPathSteering(
            agentPose(prop),
            state.hpaPathWorker,
            navState.pathSlot,
            navState.pathLen,
            targetX,
            targetY,
            state.obstacleGrid,
            state.navigation.gridNavContext,
            pathSettings,
            navState,
        );
        if (steering && !inFlight && offPathReplanDue(steering, navState, replanClockMs))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                navState.lastOffPathReplan = replanClockMs;
                return requestReplan(prop, targetX, targetY, state, replanPriorityFor("offPath", isVisible), "offPath");
            }
        return { steering, replanReason: null };
    };
    return { navState, reset, markTargetChanged, replan, update, isRoutePending };
}
