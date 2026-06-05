import { navigationSettings } from "../../Config/Config.js";
import { applySteeringResult } from "../../Libraries/Agent/index.js";
import { createNavState } from "../../Libraries/Pathfinding/navSession.js";
import { entityIntersectsCellBounds } from "../../Libraries/Spatial/grid/GridCoords.js";
import { planFlowFieldSteering } from "./FlowFieldStrategy.js";
import { planHpaSteering } from "./HpaStrategy.js";

const ARRIVED_STEERING = { desiredX: 0, desiredY: 0 };

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

    steerTo(entity, targetX, targetY, profile, flowFieldGrid = null, state = null) {
        const settings = navigationSettings;
        const grid = flowFieldGrid ?? this.flowFieldGrid;
        if (entity.targetCellBounds && entityIntersectsCellBounds(entity.x, entity.y, entity.radius, entity.targetCellBounds)) {
            applySteeringResult(entity, ARRIVED_STEERING);
            this._setDebug(entity, { mode: "arrived", dist: 0, replanReason: null, pathLen: 0 });
            return;
        }
        const dist = Math.hypot(entity.x - targetX, entity.y - targetY);
        if (dist < settings.arrivalDistance) {
            applySteeringResult(entity, ARRIVED_STEERING);
            this._setDebug(entity, { mode: "arrived", dist, replanReason: null, pathLen: 0 });
            return;
        }

        const useHpa = this.hierarchicalNavigator && dist > profile.hpaThreshold;
        const navState = this.getNavState(entity);
        let debug;

        if (useHpa) {
            const plan = planHpaSteering(
                entity, targetX, targetY,
                this.hierarchicalNavigator, navState, profile, settings,
                this.flowFieldGrid.navGraph, this.obstacleGeneration, state,
            );
            applySteeringResult(entity, plan.steering);
            debug = { mode: plan.mode, replanReason: plan.replanReason, pathLen: plan.pathLen };
        } else {
            navState.path = null;
            const plan = planFlowFieldSteering(entity, targetX, targetY, this.flowFieldGrid);
            applySteeringResult(entity, plan.steering);
            debug = { mode: plan.mode, replanReason: null, pathLen: 0 };
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
        if (distToCenter > recenterThreshold) grid.shiftCenter(playerX, playerY, playerX, playerY, playerTargetX, playerTargetY);
        return newGridPos;
    }

    onObstaclesChanged(damageBounds, playerX, playerY, playerTargetX = null, playerTargetY = null) {
        if (this.hierarchicalNavigator && damageBounds) this.hierarchicalNavigator.rebuildDamagedArea(damageBounds);
        this.flowFieldGrid.refresh(playerX, playerY, playerTargetX, playerTargetY);
        this.obstacleGeneration += 1;
    }

    rebuildNavigationGraph(playerX, playerY, playerTargetX = null, playerTargetY = null) {
        if (this.hierarchicalNavigator) this.hierarchicalNavigator.rebuildRegions(playerX, playerY);
        this.flowFieldGrid.refresh(playerX, playerY, playerTargetX, playerTargetY);
        this.obstacleGeneration += 1;
    }

    rebuildPlayerFlowField(targetX, targetY) {
        this.flowFieldGrid.syncLocalObstacles();
    }

    _setDebug(entity, info) {
        this.debugByEntity.set(entity, info);
    }
}
