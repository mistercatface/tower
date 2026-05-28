import { blendWallRepulsion, PATH_CLEARANCE_MARGIN } from "./PathFollow.js";
import { Utilities } from "../Utilities.js";

export const DEFAULT_ENEMY_REPLAN_MS = 1000;
export const DEFAULT_PLAYER_REPLAN_MS = 500;

function steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowField) {
    const field = flowField ?? flowFieldGrid?.flowField;
    if (flowFieldGrid && field) {
        const dir = flowFieldGrid.sampleDirection(entity.x, entity.y, field);
        if (dir) {
            entity.desiredX = dir.x;
            entity.desiredY = dir.y;
            return;
        }
    }

    Utilities.setDesiredDirection(entity, targetX - entity.x, targetY - entity.y);
}

function applyWallClearance(entity, obstacleGrid) {
    if (!obstacleGrid || (entity.desiredX === 0 && entity.desiredY === 0)) {
        return;
    }

    const repelled = blendWallRepulsion(
        entity.x,
        entity.y,
        entity.desiredX,
        entity.desiredY,
        obstacleGrid,
        entity.radius + PATH_CLEARANCE_MARGIN
    );
    entity.desiredX = repelled.x;
    entity.desiredY = repelled.y;
}

export function navigateToTarget(entity, targetX, targetY, options = {}) {
    const {
        flowFieldGrid = null,
        flowField = null,
        hierarchicalNavigator = null,
        obstacleGrid = null,
        replanMs = DEFAULT_ENEMY_REPLAN_MS,
        mode = "auto",
        applyClearance = true,
    } = options;

    const dist = Math.hypot(entity.x - targetX, entity.y - targetY);
    if (dist < 2) {
        entity.desiredX = 0;
        entity.desiredY = 0;
        return;
    }

    if (mode === "hpa") {
        if (hierarchicalNavigator) {
            hierarchicalNavigator.navigateEntity(entity, targetX, targetY, replanMs);
        } else {
            Utilities.setDesiredDirection(entity, targetX - entity.x, targetY - entity.y);
        }
    } else if (mode === "flow") {
        entity.hpaPath = null;
        steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowField);
    } else if (hierarchicalNavigator) {
        hierarchicalNavigator.navigateEntity(entity, targetX, targetY, replanMs);
    } else {
        steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowField);
    }

    if (applyClearance) {
        applyWallClearance(entity, obstacleGrid);
    }
}
