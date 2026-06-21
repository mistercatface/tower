import { isEmptyCellBounds, unionCellBounds } from "../DataStructures/CellRect.js";
import { gridNavCacheKey, isNavTopologyReady } from "../Spatial/grid/gridNavEpoch.js";
import { NavTopology } from "./NavTopology.js";

/** @typedef {import("../DataStructures/CellRect.js").CellBounds} CellBounds */
/** @typedef {import("../Pathfinding/FlowFieldGrid.js").FlowFieldGrid} FlowFieldGrid */
/** @typedef {import("../Pathfinding/HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
/** @typedef {import("../Pathfinding/HpaPathSession.js").HpaPathSession} HpaPathSession */
/** @typedef {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/** @typedef {(damageBounds: CellBounds | null) => void} NavWalkableSyncHook */

/** Live nav runtime — worker, path session, topology, and one invalidation spine. */
export class NavRuntime {
    /**
     * @param {object} options
     * @param {WorldObstacleGrid} options.grid
     * @param {HpaPathWorker} options.worker
     * @param {HpaPathSession} options.session
     * @param {FlowFieldGrid | { invalidateNavTopology(): void }} options.flowFieldGrid
     * @param {object} [options.settings]
     */
    constructor({ grid, worker, session, flowFieldGrid, settings = {} }) {
        this.grid = grid;
        this.worker = worker;
        this.session = session;
        this.flowFieldGrid = flowFieldGrid;
        this.settings = settings;
        this.topology = NavTopology.bindWorker(grid, worker);
        worker.setTopologySyncTarget(this.topology);
        worker.ensureNavArenaForGrid(grid);
        this._lastGridTopologyEpoch = grid.gridTopologyEpoch;
        this._workerNavGraphSyncChain = Promise.resolve();
        this._graphSyncGeneration = 0;
        /** @type {NavWalkableSyncHook | null} */
        this._navWalkableSyncHook = null;
        /** @type {((grid: WorldObstacleGrid, bounds: CellBounds | null) => { x: number, y: number }) | null} */
        this._resolvePruneWorld = null;
        grid._navTopologyRef = this.topology;
    }

    /** Current grid topology key (changes on every nav-affecting edit). */
    topologyKey() {
        return gridNavCacheKey(this.grid);
    }

    /** Worker-acknowledged topology key (null before first sync). */
    syncedTopologyKey() {
        return this.worker._syncedNavCacheKey || "";
    }

    isTopologyCurrent() {
        return isNavTopologyReady(this.worker, this.grid);
    }

    /** Topology arena sync only — no HPA region-graph patch (map-gen preview between belt passes). */
    syncTopology(damageBounds = null, grid = this.grid) {
        return this.worker.scheduleNavTopologySyncAwait(grid, damageBounds);
    }

    /** HPA region-graph generation — bumps after each completed worker graph sync. */
    get graphSyncGeneration() {
        return this._graphSyncGeneration;
    }

    /** @param {NavWalkableSyncHook | null} hook */
    setNavWalkableSyncHook(hook) {
        this._navWalkableSyncHook = hook;
    }

    /** @param {(grid: WorldObstacleGrid, bounds: CellBounds | null) => { x: number, y: number }} fn */
    setPruneSeedResolver(fn) {
        this._resolvePruneWorld = fn;
    }

    /**
     * @param {CellBounds | CellBounds[] | null} bounds
     * @param {{ fullNavSync?: boolean }} [options]
     */
    commitEdit(bounds, { fullNavSync = false } = {}) {
        const merged = fullNavSync ? null : mergeNavEditBounds(bounds);
        if (!fullNavSync && (!merged || isEmptyCellBounds(merged))) return Promise.resolve();
        return this._scheduleObstacleSync(fullNavSync ? null : merged);
    }

    /** @param {CellBounds | null} damageBounds */
    _scheduleObstacleSync(damageBounds) {
        const topologyChanged = this.grid.gridTopologyEpoch !== this._lastGridTopologyEpoch;
        if (topologyChanged) this._lastGridTopologyEpoch = this.grid.gridTopologyEpoch;
        this.flowFieldGrid.invalidateNavTopology();
        const run = () => this._syncWorkerNavGraph(this.grid, damageBounds, topologyChanged);
        this._workerNavGraphSyncChain = this._workerNavGraphSyncChain.then(run, run);
        return this._workerNavGraphSyncChain;
    }

    awaitWorkerNavReady() {
        return this._workerNavGraphSyncChain;
    }

    /** @param {CellBounds | null} damageBounds */
    _resolvePruneSeed(grid, damageBounds) {
        if (this._resolvePruneWorld) return this._resolvePruneWorld(grid, damageBounds);
        if (damageBounds && !isEmptyCellBounds(damageBounds)) {
            const midCol = (damageBounds.startCol + damageBounds.endCol) >> 1;
            const midRow = (damageBounds.startRow + damageBounds.endRow) >> 1;
            return grid.gridToWorld(midCol, midRow);
        }
        return { x: (grid.minX + grid.maxX) / 2, y: (grid.minY + grid.maxY) / 2 };
    }

    async _syncWorkerNavGraph(grid, damageBounds, topologyChanged) {
        const graphEpoch = this._graphSyncGeneration + 1;
        const seed = this._resolvePruneSeed(grid, damageBounds);
        const fullGraph = topologyChanged || !damageBounds || isEmptyCellBounds(damageBounds);
        await this.worker.syncObstacleNavGraph(grid, damageBounds, graphEpoch, seed.x, seed.y, fullGraph);
        this._graphSyncGeneration = graphEpoch;
        this._navWalkableSyncHook?.(damageBounds);
    }

    async shutdown() {
        this.worker.shutdown();
        await this._workerNavGraphSyncChain.catch(() => {});
        await this.worker.host.worker.terminate();
    }
}

/** @param {CellBounds | CellBounds[] | null | undefined} bounds */
function mergeNavEditBounds(bounds) {
    if (!bounds) return null;
    const regions = Array.isArray(bounds) ? bounds : [bounds];
    let merged = null;
    for (let i = 0; i < regions.length; i++) if (regions[i]) merged = unionCellBounds(merged, regions[i]);
    return merged;
}

/** @param {object} state */
export function resolveNavRuntime(state) {
    if (!state?.nav) throw new Error("resolveNavRuntime: state.nav is required");
    return state.nav;
}
