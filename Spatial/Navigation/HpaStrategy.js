import { trimPathAhead, computePathSteering, steerTowardTarget } from "./PathFollow.js";

export function createNavState() {
    return {
        path: null,
        lastUpdate: 0,
        lastX: null,
        lastY: null,
        stuckFrames: 0,
    };
}

function replanPath(entity, targetX, targetY, hierarchicalNavigator, navState) {
    const rawPath = hierarchicalNavigator.findPath(entity.x, entity.y, targetX, targetY);
    navState.path = rawPath ? trimPathAhead(entity.x, entity.y, rawPath) : null;
    navState.lastUpdate = Date.now();
}

export function steerViaHpa(entity, targetX, targetY, hierarchicalNavigator, navState, replanMs, settings) {
    const moved = Math.hypot(
        entity.x - (navState.lastX ?? entity.x),
        entity.y - (navState.lastY ?? entity.y)
    );
    navState.lastX = entity.x;
    navState.lastY = entity.y;

    if (moved < settings.stuckMoveThreshold) {
        navState.stuckFrames += 1;
    } else {
        navState.stuckFrames = 0;
    }

    const now = Date.now();
    let replanReason = null;
    const needsReplan = !navState.path
        || now - navState.lastUpdate > replanMs
        || navState.stuckFrames > settings.stuckReplanFrames;

    if (needsReplan) {
        if (!navState.path) {
            replanReason = "noPath";
        } else if (navState.stuckFrames > settings.stuckReplanFrames) {
            replanReason = "stuck";
        } else {
            replanReason = "interval";
        }
        replanPath(entity, targetX, targetY, hierarchicalNavigator, navState);
        navState.stuckFrames = 0;
    }

    if (navState.path && navState.path.length >= 2) {
        let steering = computePathSteering(entity, navState.path, targetX, targetY);
        if (steering.offPath) {
            replanReason = "offPath";
            replanPath(entity, targetX, targetY, hierarchicalNavigator, navState);
            if (navState.path && navState.path.length >= 2) {
                steering = computePathSteering(entity, navState.path, targetX, targetY);
            }
        }
        if (navState.path && navState.path.length >= 2) {
            entity.desiredX = steering.desiredX;
            entity.desiredY = steering.desiredY;
            return { mode: "hpa", replanReason, pathLen: navState.path.length };
        }
    }

    steerTowardTarget(entity, targetX, targetY);
    return { mode: "direct", replanReason, pathLen: 0 };
}
