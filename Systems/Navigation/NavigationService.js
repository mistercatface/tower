import { isEmptyCellBounds } from "../../Libraries/DataStructures/CellRect.js";
import { gridNavCacheKey, isGridNavStale } from "../../Libraries/Spatial/grid/gridNavEpoch.js";
/**
 * Obstacle-driven nav sync — HPA worker graph patches and flow-field topology invalidation.
 * @typedef {(damageBounds: import("../../Libraries/DataStructures/CellRect.js").CellBounds | null) => void} NavWalkableSyncHook
 */
export class NavigationService {
    /** @param {import("../../Libraries/Pathfinding/FlowFieldGrid.js").FlowFieldGrid} flowFieldGrid @param {import("../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {object} settings @param {import("../../Libraries/Pathfinding/HpaPathWorker.js").HpaPathWorker} hpaPathWorker */
    constructor(flowFieldGrid, obstacleGrid, settings, hpaPathWorker) {
        this.flowFieldGrid = flowFieldGrid;
        this._obstacleGrid = obstacleGrid;
        this._hpaPathWorker = hpaPathWorker;
        this._lastGridTopologyEpoch = obstacleGrid.gridTopologyEpoch;
        /** @type {((grid: import("../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, bounds: import("../../Libraries/DataStructures/CellRect.js").CellBounds | null) => { x: number, y: number }) | null} */
        this._resolvePruneWorld = null;
        this._workerNavGraphSyncChain = Promise.resolve();
        this.settings = settings;
        this.obstacleGeneration = 0;
        this.syncedNavCacheKey = "";
        hpaPathWorker.ensureNavArenaForGrid(obstacleGrid);
        this.gridNavContext = {
            grid: obstacleGrid,
            get wallRevision() {
                return obstacleGrid.wallGridRevision;
            },
            get navCardinalOpen() {
                return hpaPathWorker.getNavArena().cardinalOpen;
            },
            get vertexPassability() {
                return hpaPathWorker.getNavArena().vertexPassability;
            },
        };
        /** @type {NavWalkableSyncHook | null} */
        this._navWalkableSyncHook = null;
    }
    navCacheKey() {
        return gridNavCacheKey(this._obstacleGrid);
    }
    isNavTopologySynced() {
        return this._hpaPathWorker.isNavTopologySynced(this._obstacleGrid);
    }
    isNavTopologyStale() {
        return isGridNavStale(this._obstacleGrid, this.syncedNavCacheKey);
    }
    /** @param {NavWalkableSyncHook | null} hook */
    setNavWalkableSyncHook(hook) {
        this._navWalkableSyncHook = hook;
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
        this.flowFieldGrid.invalidateNavTopology();
        const run = () => this._syncWorkerNavGraph(grid, damageBounds, topologyChanged);
        this._workerNavGraphSyncChain = this._workerNavGraphSyncChain.then(run, run);
        return this._workerNavGraphSyncChain;
    }
    awaitWorkerNavReady() {
        return this._workerNavGraphSyncChain;
    }
    _markNavTopologySynced() {
        this.syncedNavCacheKey = this._hpaPathWorker.getSyncedNavCacheKey();
    }
    async _syncWorkerNavGraph(grid, damageBounds, topologyChanged) {
        const graphEpoch = this.obstacleGeneration + 1;
        const seed = this._resolvePruneSeed(grid, damageBounds);
        const fullGraph = topologyChanged || !damageBounds || isEmptyCellBounds(damageBounds);
        await this._hpaPathWorker.syncObstacleNavGraph(grid, damageBounds, graphEpoch, seed.x, seed.y, fullGraph);
        this.obstacleGeneration = graphEpoch;
        this._markNavTopologySynced();
        this._navWalkableSyncHook?.(damageBounds);
    }
}
