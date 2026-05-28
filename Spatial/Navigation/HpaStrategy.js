import { trimPathAhead, computePathSteering, steerTowardTarget } from "./PathFollow.js";
import { adjustPathForClearance } from "./PathClearance.js";

export function createNavState() {
    return {
        path: null,
        lastUpdate: 0,
        lastX: null,
        lastY: null,
        stuckFrames: 0,
        pathProgressIdx: 0,
        obstacleGeneration: -1,
    };
}

function replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings) {
    const rawPath = hierarchicalNavigator.findPath(entity.x, entity.y, targetX, targetY);
    let path = rawPath ? trimPathAhead(entity.x, entity.y, rawPath) : null;
    if (path && obstacleGrid) {
        const clearance = entity.radius + settings.pathClearanceMargin;
        const destination = { x: targetX, y: targetY };
        path = adjustPathForClearance(path, obstacleGrid, clearance, destination);
    }
    if (path) {
        path = trimPathAhead(entity.x, entity.y, path);
    }
    navState.path = path;
    navState.pathProgressIdx = 0;
    navState.lastUpdate = Date.now();
}

export function steerViaHpa(entity, targetX, targetY, hierarchicalNavigator, navState, profile, settings, obstacleGrid, obstacleGeneration) {
    const replanMs = profile.replanMs;
    const replanWhileMoving = profile.replanWhileMoving !== false;
    const obstaclesChanged = navState.obstacleGeneration !== obstacleGeneration;
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

    if (obstaclesChanged) {
        navState.obstacleGeneration = obstacleGeneration;
        navState.path = null;
        replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings);
        replanReason = "obstacles";
        navState.stuckFrames = 0;
    }

    const needsReplan = !navState.path
        || navState.stuckFrames > settings.stuckReplanFrames
        || (replanWhileMoving && now - navState.lastUpdate > replanMs);

    if (needsReplan && !obstaclesChanged) {
        if (!navState.path) {
            replanReason = "noPath";
        } else if (navState.stuckFrames > settings.stuckReplanFrames) {
            replanReason = "stuck";
        } else {
            replanReason = "interval";
        }
        replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings);
        navState.stuckFrames = 0;
    }

    if (navState.path && navState.path.length >= 2) {
        let steering = computePathSteering(entity, navState.path, targetX, targetY, settings, navState);
        if (steering.offPath) {
            replanReason = "offPath";
            replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings);
            if (navState.path && navState.path.length >= 2) {
                steering = computePathSteering(entity, navState.path, targetX, targetY, settings, navState);
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
