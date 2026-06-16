import { NavigationController } from "../../Libraries/Navigation/index.js";
import { refreshNavCrossingGrant, syncCrossingGrantToEntity } from "../../Libraries/Pathfinding/crossingGrant.js";
import { isEmptyCellBounds } from "../../Libraries/DataStructures/CellRect.js";
import { VIEWPORT_VISIBILITY_PAD_WIDE } from "../../Libraries/Viewport/Viewport.js";
import { planHpaSteering } from "./HpaStrategy.js";
/**
 * Game glue for navigation — wires HPA replan policy and entity post-steer hooks
 * into Libraries/Navigation/NavigationController.
 */
export class NavigationService {
    /** @param {import("../../Libraries/Pathfinding/FlowFieldGrid.js").FlowFieldGrid} flowFieldGrid @param {import("../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {object} settings @param {import("../../Libraries/Pathfinding/HpaPathWorker.js").HpaPathWorker | null} [hpaPathWorker] */
    constructor(flowFieldGrid, obstacleGrid, settings, hpaPathWorker = null) {
        this._hpaPathWorker = hpaPathWorker;
        this._obstacleGrid = obstacleGrid;
        this._lastGridTopologyEpoch = obstacleGrid.gridTopologyEpoch;
        /** @type {((grid: import("../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, bounds: import("../../Libraries/DataStructures/CellRect.js").CellBounds | null) => { x: number, y: number }) | null} */
        this._resolvePruneWorld = null;
        this._workerNavGraphSyncChain = Promise.resolve();
        this._controller = new NavigationController({
            flowFieldGrid,
            obstacleGrid,
            hpaPathWorker,
            settings,
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
                    state.hpaPathWorker,
                ),
            onSteerComplete: (entity, { navState, settings, plan }) => {
                if (plan.mode === "hpa") {
                    refreshNavCrossingGrant(navState, obstacleGrid, this._hpaPathWorker);
                    syncCrossingGrantToEntity(entity, navState);
                }
                entity.hpaPath = navState.pathLen > 0 ? null : navState.path;
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
    /** @param {(grid: import("../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, bounds: import("../../Libraries/DataStructures/CellRect.js").CellBounds | null) => { x: number, y: number }} fn */
    setPruneSeedResolver(fn) {
        this._resolvePruneWorld = fn;
    }
    _resolvePruneSeed(grid, damageBounds) {
        if (this._resolvePruneWorld) return this._resolvePruneWorld(grid, damageBounds);
        if (damageBounds && !isEmptyCellBounds(damageBounds)) {
            const midCol = (damageBounds.startCol + damageBounds.endCol) >> 1;
            const midRow = (damageBounds.startRow + damageBounds.endRow) >> 1;
            return grid.gridToWorld(midCol, midRow);
        }
        return { x: (grid.minX + grid.maxX) / 2, y: (grid.minY + grid.maxY) / 2 };
    }
    onObstaclesChanged(damageBounds) {
        const grid = this._obstacleGrid;
        const topologyChanged = grid.gridTopologyEpoch !== this._lastGridTopologyEpoch;
        if (topologyChanged) this._lastGridTopologyEpoch = grid.gridTopologyEpoch;
        this._controller.invalidateObstacleNav();
        if (!this._hpaPathWorker) return Promise.resolve();
        const run = () => this._syncWorkerNavGraph(grid, damageBounds, topologyChanged);
        this._workerNavGraphSyncChain = this._workerNavGraphSyncChain.then(run, run);
        return this._workerNavGraphSyncChain;
    }
    awaitWorkerNavReady() {
        return this._workerNavGraphSyncChain;
    }
    async _syncWorkerNavGraph(grid, damageBounds, topologyChanged) {
        const graphEpoch = this._controller.obstacleGeneration + 1;
        const seed = this._resolvePruneSeed(grid, damageBounds);
        this._hpaPathWorker.setPruneSeed(seed.x, seed.y);
        if (topologyChanged || !damageBounds || isEmptyCellBounds(damageBounds)) {
            await this._hpaPathWorker.scheduleNavTopologySyncAwait(grid);
            await this._hpaPathWorker.buildRegionGraphFull(grid, seed.x, seed.y, graphEpoch);
        } else {
            await this._hpaPathWorker.patchNavTopology(grid, damageBounds);
            await this._hpaPathWorker.patchRegionGraph(grid, damageBounds, graphEpoch);
        }
        this._controller.obstacleGeneration = graphEpoch;
    }
    get obstacleGeneration() {
        return this._controller.obstacleGeneration;
    }
    rebuildNavigationGraph(playerX, playerY) {
        this._controller.invalidateObstacleNav();
        if (!this._hpaPathWorker) return Promise.resolve();
        this._hpaPathWorker.setPruneSeed(playerX, playerY);
        const run = () => this._syncWorkerNavGraph(this._obstacleGrid, null, true);
        this._workerNavGraphSyncChain = this._workerNavGraphSyncChain.then(run, run);
        return this._workerNavGraphSyncChain;
    }
}
