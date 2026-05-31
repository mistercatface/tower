import { trimPathAhead, computePathSteering, steerTowardTarget } from "./PathFollow.js";
import { prepareNavigationPath, orthogonalizePath } from "./PathClearance.js";

export function createNavState() {
    return {
        path: null,
        lastUpdate: 0,
        lastX: null,
        lastY: null,
        stuckFrames: 0,
        pathProgressIdx: 0,
        obstacleGeneration: -1,
        lastTargetX: null,
        lastTargetY: null,
        lastOffPathReplan: 0,
    };
}

function shouldApplyClearance(navState, targetX, targetY, obstaclesChanged) {
    if (obstaclesChanged) return true;
    if (!navState.path) return true;
    if (navState.lastTargetX !== targetX || navState.lastTargetY !== targetY) return true;
    return false;
}

function replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, applyClearance, profile) {
    const rawPath = hierarchicalNavigator.findPath(entity.x, entity.y, targetX, targetY);
    let path = rawPath ? trimPathAhead(entity.x, entity.y, rawPath) : null;
    if (path && obstacleGrid && applyClearance) {
        if (profile?.skipPathClearance) {
            path = orthogonalizePath(path, obstacleGrid, entity.radius);
        } else {
            const clearance = entity.radius + settings.pathClearanceMargin;
            path = prepareNavigationPath(path, obstacleGrid, clearance, { x: targetX, y: targetY });
        }
    }
    if (path) {
        path = trimPathAhead(entity.x, entity.y, path);
    }
    navState.path = path;
    navState.pathProgressIdx = 0;
    navState.lastUpdate = Date.now();
    navState.lastTargetX = targetX;
    navState.lastTargetY = targetY;
}

export function steerViaHpa(entity, targetX, targetY, hierarchicalNavigator, navState, profile, settings, obstacleGrid, obstacleGeneration) {
    const replanMs = profile.replanMs;
    const replanWhileMoving = profile.replanWhileMoving !== false;
    const obstaclesChanged = navState.obstacleGeneration !== obstacleGeneration;
    const moved = Math.hypot(
        entity.x - (navState.lastX ?? entity.x),
        entity.y - (navState.lastY ?? entity.y),
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
        replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, true, profile);
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
        const applyClearance = shouldApplyClearance(navState, targetX, targetY, false);
        replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, applyClearance, profile);
        navState.stuckFrames = 0;
    }

    if (navState.path && navState.path.length >= 2) {
        let steering = computePathSteering(entity, navState.path, targetX, targetY, settings, navState);
        if (steering.offPath && now - navState.lastOffPathReplan >= replanMs) {
            replanReason = "offPath";
            navState.lastOffPathReplan = now;
            replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, false, profile);
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
