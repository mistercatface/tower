import { agentPose } from "../../Libraries/Agent/index.js";
import { computeHpaSteering } from "../../Libraries/Pathfinding/hpaSteering.js";
import { trimPathAhead } from "../../Libraries/Pathfinding/pathFollow.js";
import { prepareNavigationPath, orthogonalizePath } from "../../Libraries/Pathfinding/PathClearance.js";

function shouldApplyClearance(navState, targetX, targetY, obstaclesChanged) {
    if (obstaclesChanged) return true;
    if (!navState.path) return true;
    if (navState.lastTargetX !== targetX || navState.lastTargetY !== targetY) return true;
    return false;
}

function replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, applyClearance, profile, state = null) {
    const rawPath = hierarchicalNavigator.findPath(entity.x, entity.y, targetX, targetY);
    let path = rawPath ? trimPathAhead(entity.x, entity.y, rawPath) : null;
    if (path && obstacleGrid && applyClearance) {
        const viewport = state?.fsm?.context?.viewport;
        const isVisible = viewport ? viewport.isVisible(entity.x, entity.y, entity.radius, 128) : true;
        if (!isVisible) {
            // Off-screen: bypass geometry-based path clearance relaxation for performance.
            // The raw A* path is already grid-walkable.
        } else if (profile?.skipPathClearance) {
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

/**
 * HPA replan policy + pure steering compute. Does not mutate desiredX/Y.
 * @returns {{ steering: import("../../Libraries/Agent/types.js").SteeringResult, mode: string, replanReason: string | null, pathLen: number }}
 */
export function planHpaSteering(entity, targetX, targetY, hierarchicalNavigator, navState, profile, settings, obstacleGrid, obstacleGeneration, state = null) {
    const replanMs = profile.replanMs;
    const viewport = state?.fsm?.context?.viewport;
    const isVisible = viewport ? viewport.isVisible(entity.x, entity.y, entity.radius, 128) : true;
    const effectiveReplanMs = isVisible ? replanMs : replanMs * 10;

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

    let didReplanForObstacles = false;
    if (obstaclesChanged) {
        navState.obstacleGeneration = obstacleGeneration;
        navState.path = null;
        if (isVisible || navState.stuckFrames > settings.stuckReplanFrames) {
            replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, true, profile, state);
            replanReason = "obstacles";
            navState.stuckFrames = 0;
            didReplanForObstacles = true;
        }
    }

    const needsReplan = !navState.path
        || navState.stuckFrames > settings.stuckReplanFrames
        || (replanWhileMoving && now - navState.lastUpdate > effectiveReplanMs);

    if (needsReplan && !didReplanForObstacles) {
        if (!navState.path) {
            replanReason = "noPath";
        } else if (navState.stuckFrames > settings.stuckReplanFrames) {
            replanReason = "stuck";
        } else {
            replanReason = "interval";
        }
        const applyClearance = shouldApplyClearance(navState, targetX, targetY, false);
        if (isVisible || navState.stuckFrames > settings.stuckReplanFrames || (now - navState.lastUpdate > effectiveReplanMs)) {
            replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, applyClearance, profile, state);
            navState.stuckFrames = 0;
        }
    }

    const pose = agentPose(entity);
    let steering = computeHpaSteering(pose, navState.path, targetX, targetY, settings, navState);

    if (navState.path && navState.path.length >= 2 && steering.offPath && now - navState.lastOffPathReplan >= effectiveReplanMs) {
        replanReason = "offPath";
        navState.lastOffPathReplan = now;
        replanPath(entity, targetX, targetY, hierarchicalNavigator, navState, obstacleGrid, settings, false, profile, state);
        steering = computeHpaSteering(pose, navState.path, targetX, targetY, settings, navState);
    }

    const hasPath = navState.path && navState.path.length >= 2;
    return {
        steering,
        mode: hasPath ? "hpa" : "direct",
        replanReason,
        pathLen: hasPath ? navState.path.length : 0,
    };
}
