import { NavigationController } from "../../Libraries/Navigation/index.js";
import { createHpaHooks } from "./hpaHooks.js";
import { planHpaSteering } from "./HpaStrategy.js";
/**
 * Game glue for navigation — wires HPA replan policy and entity post-steer hooks
 * into Libraries/Navigation/NavigationController.
 */
export class NavigationService {
    constructor(flowFieldGrid, hierarchicalNavigator, settings) {
        this._controller = new NavigationController({
            flowFieldGrid,
            hierarchicalNavigator,
            settings,
            planHpa: (entity, targetX, targetY, navState, profile, controller, state) =>
                planHpaSteering(
                    entity,
                    targetX,
                    targetY,
                    controller.hierarchicalNavigator,
                    navState,
                    profile,
                    controller.settings,
                    controller.flowFieldGrid.navGraph,
                    controller.obstacleGeneration,
                    createHpaHooks(state),
                    state?.gameTime ?? Date.now(),
                ),
            onSteerComplete: (entity, { navState, settings }) => {
                entity.hpaPath = navState.path;
                if (entity.isMoving) {
                    entity.targetNodeX = entity.x + entity.desiredX * settings.targetNodeLookahead;
                    entity.targetNodeY = entity.y + entity.desiredY * settings.targetNodeLookahead;
                }
            },
        });
    }
    getNavState(entity) {
        return this._controller.getNavState(entity);
    }
    getPath(entity) {
        return this._controller.getPath(entity);
    }
    getDebugInfo(entity) {
        return this._controller.getDebugInfo(entity);
    }
    clear(entity) {
        this._controller.clear(entity);
    }
    steerTo(entity, targetX, targetY, profile, flowFieldGrid = null, state = null) {
        this._controller.steerTo(entity, targetX, targetY, profile, flowFieldGrid, state);
    }
    updateFlowField(opts) {
        return this._controller.updateFlowField(opts);
    }
    onObstaclesChanged(damageBounds) {
        this._controller.onObstaclesChanged(damageBounds);
    }
    rebuildNavigationGraph(playerX, playerY) {
        this._controller.rebuildNavigationGraph(playerX, playerY);
    }
    rebuildPlayerFlowField(targetX, targetY) {
        this._controller.rebuildPlayerFlowField(targetX, targetY);
    }
}
