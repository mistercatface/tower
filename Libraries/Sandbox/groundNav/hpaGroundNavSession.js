import { agentPose } from "../../Agent/index.js";
import { createNavState } from "../../Pathfinding/navSession.js";
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
import { resolveNavRuntime } from "../../Navigation/NavRuntime.js";
export function createHpaGroundNavSession() {
    const navState = createNavState();
    let replanClockMs = 0;
    let pendingTargetReplan = false;
    const reset = (state) => {
        pendingTargetReplan = false;
        const nav = resolveNavRuntime(state);
        nav.worker.releaseOwnedPathSlot(navState);
        Object.assign(navState, createNavState());
        replanClockMs = 0;
    };
    const markTargetChanged = () => {
        pendingTargetReplan = true;
    };
    const isRoutePending = () => pendingTargetReplan || navState.hpaReplanRequestId !== 0;
    const replan = (prop, targetX, targetY, state, priority = REPLAN_PRIORITY_TARGET) => {
        const nav = resolveNavRuntime(state);
        return nav.session.requestReplan(navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, nav, prop.navStepPenalty), priority);
    };
    const requestReplan = (prop, targetX, targetY, state, priority, reason) => {
        const accepted = replan(prop, targetX, targetY, state, priority);
        if (accepted) {
            pendingTargetReplan = false;
            navState.stuckFrames = 0;
            return { steering: null, replanReason: reason };
        }
        return { steering: null, replanReason: "cooldown" };
    };
    const update = (prop, targetX, targetY, state, dtMs, pathSettings) => {
        replanClockMs += dtMs;
        const nav = resolveNavRuntime(state);
        const settings = nav.settings;
        const inFlight = nav.session.isReplanInFlight(navState);
        const routePending = pendingTargetReplan || navState.hpaReplanRequestId !== 0;
        if (inFlight || routePending) {
            navState.stuckFrames = 0;
            navState.lastX = prop.x;
            navState.lastY = prop.y;
        } else trackNavStuck(navState, prop.x, prop.y, settings.stuckMoveThreshold);
        const isVisible = state.viewport.circleInBounds(prop.x, prop.y, prop.radius, "props");
        const stuckFrames = navState.stuckFrames;
        const stuckReplanFrames = settings.stuckReplanFrames;
        if (!inFlight && obstacleEpochReplanDue(navState, nav.topologyKey()))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) return requestReplan(prop, targetX, targetY, state, replanPriorityFor("epoch", isVisible), "epoch");
        const sandboxReason = sandboxReplanReason(navState, pendingTargetReplan, inFlight, targetX, targetY);
        if (sandboxReason && sandboxReplanAllowed(sandboxReason, isVisible, stuckFrames, stuckReplanFrames))
            return requestReplan(prop, targetX, targetY, state, replanPriorityFor(sandboxReason, isVisible), sandboxReason);
        const idleReason = idlePathReplanReason(navState, settings, inFlight);
        if (idleReason && idlePathReplanAllowed(navState, idleReason, isVisible, stuckReplanFrames))
            return requestReplan(prop, targetX, targetY, state, replanPriorityFor(idleReason, isVisible), idleReason);
        if (!navHasPath(navState)) return { steering: null, replanReason: routePending ? "pending" : "noPath" };
        const steering = computeSabPathSteering(agentPose(prop), nav.worker, navState.pathSlot, navState.pathLen, targetX, targetY, state.obstacleGrid, nav.topology, pathSettings, navState);
        if (steering && !inFlight && offPathReplanDue(steering, navState, replanClockMs))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                navState.lastOffPathReplan = replanClockMs;
                return requestReplan(prop, targetX, targetY, state, replanPriorityFor("offPath", isVisible), "offPath");
            }
        return { steering, replanReason: null };
    };
    return { navState, reset, markTargetChanged, replan, update, isRoutePending };
}
