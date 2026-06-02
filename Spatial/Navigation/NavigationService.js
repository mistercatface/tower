import { navigationSettings, NAV_PROFILES } from "../../Config/Config.js";
import { entityIntersectsCellBounds } from "../Geometry/GridCoords.js";
import { steerViaFlowField } from "./FlowFieldStrategy.js";
import { createNavState, steerViaHpa } from "./HpaStrategy.js";
import { FLOW_FIELD_FULL_RANGE } from "./flowFieldCompute.js";

export { NAV_PROFILES };

export class NavigationService {
    constructor(flowFieldGrid, hierarchicalNavigator) {
        this.flowFieldGrid = flowFieldGrid;
        this.hierarchicalNavigator = hierarchicalNavigator;
        this.navStates = new WeakMap();
        this.debugByEntity = new WeakMap();
        this.obstacleGeneration = 0;
    }

    getNavState(entity) {
        if (!this.navStates.has(entity)) this.navStates.set(entity, createNavState());
        return this.navStates.get(entity);
    }

    getPath(entity) {
        return this.getNavState(entity).path;
    }

    getDebugInfo(entity) {
        return this.debugByEntity.get(entity) ?? null;
    }

    clear(entity) {
        this.navStates.delete(entity);
        this.debugByEntity.delete(entity);
        entity.hpaPath = null;
    }

    steerTo(entity, targetX, targetY, profile, flowFieldGrid = null) {
        const settings = navigationSettings;
        const grid = flowFieldGrid ?? this.flowFieldGrid;
        if (entity.targetCellBounds && entityIntersectsCellBounds(entity.x, entity.y, entity.radius, entity.targetCellBounds)) {
            entity.desiredX = 0;
            entity.desiredY = 0;
            this._setDebug(entity, { mode: "arrived", dist: 0, replanReason: null, pathLen: 0 });
            return;
        }
        const dist = Math.hypot(entity.x - targetX, entity.y - targetY);
        if (dist < settings.arrivalDistance) {
            entity.desiredX = 0;
            entity.desiredY = 0;
            this._setDebug(entity, { mode: "arrived", dist, replanReason: null, pathLen: 0 });
            return;
        }
        const useHpa = this.hierarchicalNavigator && dist > profile.hpaThreshold;
        const navState = this.getNavState(entity);
        let debug;
        if (useHpa) {
            debug = steerViaHpa(entity, targetX, targetY, this.hierarchicalNavigator, navState, profile, settings, this.flowFieldGrid.obstacleGrid, this.obstacleGeneration);
        } else {
            navState.path = null;
            const mode = steerViaFlowField(entity, targetX, targetY, this.flowFieldGrid, profile.flowField);
            debug = { mode, replanReason: null, pathLen: 0 };
        }
        entity.hpaPath = navState.path;
        this._setDebug(entity, { ...debug, dist });
        if (entity.isMoving) {
            entity.targetNodeX = entity.x + entity.desiredX * settings.targetNodeLookahead;
            entity.targetNodeY = entity.y + entity.desiredY * settings.targetNodeLookahead;
        }
    }

    updateFlowField({ playerX, playerY, playerTargetX = null, playerTargetY = null, previousGridPos = null, recenterThreshold = navigationSettings.recenterThreshold }) {
        const grid = this.flowFieldGrid;
        const newGridPos = grid.worldToGrid(playerX, playerY);
        const distToCenter = Math.max(Math.abs(playerX - grid.centerX), Math.abs(playerY - grid.centerY));
        if (distToCenter > recenterThreshold) {
            grid.shiftCenter(playerX, playerY, playerX, playerY, playerTargetX, playerTargetY);
        } else if (previousGridPos && (previousGridPos.col !== newGridPos.col || previousGridPos.row !== newGridPos.row)) {
            const maxRange = navigationSettings.flowFieldFullRebuild
                ? FLOW_FIELD_FULL_RANGE
                : navigationSettings.flowFieldLocalRange;
            grid.buildFlowField(playerX, playerY, maxRange);
        }
        return newGridPos;
    }

    onObstaclesChanged(damageBounds, playerX, playerY, playerTargetX = null, playerTargetY = null) {
        if (this.hierarchicalNavigator && damageBounds) this.hierarchicalNavigator.rebuildDamagedArea(damageBounds);
        this.flowFieldGrid.refresh(playerX, playerY, playerTargetX, playerTargetY);
        this.obstacleGeneration += 1;
    }

    rebuildNavigationGraph(playerX, playerY, playerTargetX = null, playerTargetY = null) {
        if (this.hierarchicalNavigator) this.hierarchicalNavigator.rebuildRegions();
        this.flowFieldGrid.refresh(playerX, playerY, playerTargetX, playerTargetY);
        this.obstacleGeneration += 1;
    }

    rebuildPlayerFlowField(targetX, targetY) {
        this.flowFieldGrid.syncLocalObstacles();
        this.flowFieldGrid.buildPlayerFlowField(targetX, targetY, FLOW_FIELD_FULL_RANGE);
    }

    _setDebug(entity, info) {
        this.debugByEntity.set(entity, info);
    }
}
