import { navigationSettings, NAV_PROFILES } from "../../Config.js";
import { steerViaFlowField } from "./FlowFieldStrategy.js";
import { createNavState, steerViaHpa } from "./HpaStrategy.js";

export { NAV_PROFILES };

export class NavigationService {
    constructor(flowFieldGrid, hierarchicalNavigator) {
        this.flowFieldGrid = flowFieldGrid;
        this.hierarchicalNavigator = hierarchicalNavigator;
        this.navStates = new WeakMap();
        this.debugByEntity = new WeakMap();
    }

    getNavState(entity) {
        if (!this.navStates.has(entity)) {
            this.navStates.set(entity, createNavState());
        }
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

    steerTo(entity, targetX, targetY, profile) {
        const settings = navigationSettings;
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
            debug = steerViaHpa(
                entity,
                targetX,
                targetY,
                this.hierarchicalNavigator,
                navState,
                profile.replanMs,
                settings
            );
        } else {
            navState.path = null;
            const mode = steerViaFlowField(
                entity,
                targetX,
                targetY,
                this.flowFieldGrid,
                profile.flowField
            );
            debug = { mode, replanReason: null, pathLen: 0 };
        }

        entity.hpaPath = navState.path;
        this._setDebug(entity, { ...debug, dist });

        if (entity.isMoving) {
            entity.targetNodeX = entity.x + entity.desiredX * settings.targetNodeLookahead;
            entity.targetNodeY = entity.y + entity.desiredY * settings.targetNodeLookahead;
        }
    }

    updateFlowField({
        playerX,
        playerY,
        playerTargetX = null,
        playerTargetY = null,
        previousGridPos = null,
        recenterThreshold = navigationSettings.recenterThreshold,
    }) {
        const grid = this.flowFieldGrid;
        const newGridPos = grid.worldToGrid(playerX, playerY);
        const distToCenter = Math.max(
            Math.abs(playerX - grid.centerX),
            Math.abs(playerY - grid.centerY)
        );

        if (distToCenter > recenterThreshold) {
            grid.shiftCenter(playerX, playerY, playerX, playerY, playerTargetX, playerTargetY);
        } else if (
            previousGridPos
            && (previousGridPos.col !== newGridPos.col || previousGridPos.row !== newGridPos.row)
        ) {
            grid.buildFlowField(playerX, playerY);
        }

        return newGridPos;
    }

    onObstaclesChanged(playerX, playerY, playerTargetX = null, playerTargetY = null) {
        if (this.hierarchicalNavigator) {
            this.hierarchicalNavigator.rebuildRegions();
        }
        this.flowFieldGrid.refresh(playerX, playerY, playerTargetX, playerTargetY);
    }

    _setDebug(entity, info) {
        this.debugByEntity.set(entity, info);
    }
}
