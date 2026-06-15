import { NavigationController } from "../../Libraries/Navigation/index.js";
import { refreshNavCrossingGrant, syncCrossingGrantToEntity } from "../../Libraries/Pathfinding/crossingGrant.js";
import { VIEWPORT_VISIBILITY_PAD_WIDE } from "../../Libraries/Viewport/Viewport.js";
import { planHpaSteering } from "./HpaStrategy.js";
/**
 * Game glue for navigation — wires HPA replan policy and entity post-steer hooks
 * into Libraries/Navigation/NavigationController.
 */
export class NavigationService {
    constructor(flowFieldGrid, hierarchicalNavigator, settings, hpaPathWorker = null) {
        const obstacleGrid = hierarchicalNavigator.navGraph;
        this._hpaPathWorker = hpaPathWorker;
        this._hierarchicalNavigator = hierarchicalNavigator;
        this._controller = new NavigationController({
            flowFieldGrid,
            hierarchicalNavigator,
            settings,
            hpaPathWorker,
            planHpa: (entity, targetX, targetY, navState, profile, controller, state) =>
                planHpaSteering(
                    entity,
                    targetX,
                    targetY,
                    state.hpaPathSession,
                    navState,
                    profile,
                    controller.settings,
                    state.obstacleGrid,
                    controller.obstacleGeneration,
                    { isVisible: (e) => state.viewport.isVisible(e.x, e.y, e.radius, VIEWPORT_VISIBILITY_PAD_WIDE) },
                    state?.gameTime ?? Date.now(),
                ),
            onSteerComplete: (entity, { navState, settings, plan }) => {
                if (plan.mode === "hpa") {
                    refreshNavCrossingGrant(navState, obstacleGrid);
                    syncCrossingGrantToEntity(entity, navState);
                }
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
        this._controller.onObstaclesChanged(damageBounds, this._controller.hierarchicalNavigator?.navGraph);
        if (this._hpaPathWorker) {
            this._hpaPathWorker.scheduleNavTopologySync(this._controller.hierarchicalNavigator?.navGraph);
            this._hpaPathWorker.syncAbstractGraph(this._hierarchicalNavigator, this._controller.obstacleGeneration);
        }
    }
    get obstacleGeneration() {
        return this._controller.obstacleGeneration;
    }
    rebuildNavigationGraph(playerX, playerY) {
        this._controller.rebuildNavigationGraph(playerX, playerY);
    }
}
