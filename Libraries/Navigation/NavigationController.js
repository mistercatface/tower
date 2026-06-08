import { applySteeringResult, agentPose, getMobileAgent } from "../Agent/index.js";
import { computeFlowFieldSteering } from "../Pathfinding/flowFieldPlan.js";
import { createNavState } from "../Pathfinding/navSession.js";
import { entityIntersectsCellBounds } from "../Spatial/grid/GridCoords.js";
const ARRIVED_STEERING = { desiredX: 0, desiredY: 0 };
/**
 * @typedef {import("../Pathfinding/navSession.js").NavSessionState} NavSessionState
 * @typedef {import("../Agent/types.js").SteeringResult} SteeringResult
 */
/**
 * @typedef {object} SteerPlan
 * @property {SteeringResult} steering
 * @property {string} mode
 * @property {string | null} [replanReason]
 * @property {number} pathLen
 */
/**
 * @typedef {object} NavigationControllerHooks
 * @property {(entity: object, targetX: number, targetY: number, navState: NavSessionState, profile: object, controller: NavigationController, state: object | null) => SteerPlan} planHpa
 * @property {(entity: object, targetX: number, targetY: number, settings: object) => boolean} [isArrived]
 * @property {(entity: object, ctx: { navState: NavSessionState, plan: SteerPlan, dist: number, settings: object }) => void} [onSteerComplete]
 */
/**
 * Owns nav sessions, steering orchestration, flow-field maintenance, and debug state.
 * Game layers inject HPA replan policy and entity-specific arrival / post-steer hooks.
 */
export class NavigationController {
    /**
     * @param {{
     *   flowFieldGrid: object,
     *   hierarchicalNavigator: object | null,
     *   settings: object,
     *   planHpa: NavigationControllerHooks["planHpa"],
     *   isArrived?: NavigationControllerHooks["isArrived"],
     *   onSteerComplete?: NavigationControllerHooks["onSteerComplete"],
     * }} config
     */
    constructor({ flowFieldGrid, hierarchicalNavigator, settings, planHpa, isArrived = null, onSteerComplete = null }) {
        this.flowFieldGrid = flowFieldGrid;
        this.hierarchicalNavigator = hierarchicalNavigator;
        this.settings = settings;
        this.planHpa = planHpa;
        this.isArrived = isArrived;
        this.onSteerComplete = onSteerComplete;
        this.navStates = new WeakMap();
        this.debugByEntity = new WeakMap();
        this.obstacleGeneration = 0;
    }
    /** @returns {NavSessionState} */
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
        const settings = this.settings;
        const grid = flowFieldGrid ?? this.flowFieldGrid;
        const mobile = getMobileAgent(entity);
        if (this._checkArrived(entity, targetX, targetY, settings)) {
            applySteeringResult(mobile, ARRIVED_STEERING);
            this._setDebug(entity, { mode: "arrived", dist: 0, replanReason: null, pathLen: 0 });
            return;
        }
        const dist = Math.hypot(entity.x - targetX, entity.y - targetY);
        if (dist < settings.arrivalDistance) {
            applySteeringResult(mobile, ARRIVED_STEERING);
            this._setDebug(entity, { mode: "arrived", dist, replanReason: null, pathLen: 0 });
            return;
        }
        const useHpa = this.hierarchicalNavigator && dist > profile.hpaThreshold;
        const navState = this.getNavState(entity);
        let plan;
        if (useHpa) {
            plan = this.planHpa(entity, targetX, targetY, navState, profile, this, state);
            applySteeringResult(mobile, plan.steering);
            this._setDebug(entity, { mode: plan.mode, replanReason: plan.replanReason ?? null, pathLen: plan.pathLen, dist });
        } else {
            navState.path = null;
            plan = computeFlowFieldSteering(agentPose(entity), targetX, targetY, grid);
            applySteeringResult(mobile, plan.steering);
            this._setDebug(entity, { mode: plan.mode, replanReason: null, pathLen: 0, dist });
        }
        if (this.onSteerComplete) this.onSteerComplete(entity, { navState, plan, dist, settings });
    }
    updateFlowField({ playerX, playerY, recenterThreshold = this.settings.recenterThreshold }) {
        const grid = this.flowFieldGrid;
        const newGridPos = grid.worldToGrid(playerX, playerY);
        const distToCenter = Math.max(Math.abs(playerX - grid.centerX), Math.abs(playerY - grid.centerY));
        if (distToCenter > recenterThreshold) grid.shiftCenter(playerX, playerY);
        return newGridPos;
    }
    onObstaclesChanged(damageBounds) {
        if (this.hierarchicalNavigator && damageBounds) this.hierarchicalNavigator.rebuildDamagedArea(damageBounds);
        this.flowFieldGrid.refresh();
        this.obstacleGeneration += 1;
    }
    rebuildNavigationGraph(playerX, playerY) {
        if (this.hierarchicalNavigator) this.hierarchicalNavigator.rebuildRegions(playerX, playerY);
        this.flowFieldGrid.refresh();
        this.obstacleGeneration += 1;
    }
    rebuildPlayerFlowField(targetX, targetY) {
        this.flowFieldGrid.syncLocalObstacles();
    }
    _checkArrived(entity, targetX, targetY, settings) {
        if (this.isArrived) return this.isArrived(entity, targetX, targetY, settings);
        if (entity.targetCellBounds && entityIntersectsCellBounds(entity.x, entity.y, entity.radius, entity.targetCellBounds)) return true;
        return false;
    }
    _setDebug(entity, info) {
        this.debugByEntity.set(entity, info);
    }
}
