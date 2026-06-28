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
    /**
     * @param {CellBounds | CellBounds[] | null} bounds
     * @param {{ fullNavSync?: boolean }} [options]
     */
    commitEdit(idx, { fullNavSync = false } = {}) {
        return this._scheduleObstacleSync(fullNavSync ? null : idx);
    }
    _scheduleObstacleSync(idx) {
        const topologyChanged = this.grid.gridTopologyEpoch !== this._lastGridTopologyEpoch;
        if (topologyChanged) this._lastGridTopologyEpoch = this.grid.gridTopologyEpoch;
        this.flowFieldGrid.invalidateNavTopology();
        const run = () => this._syncWorkerNavGraph(this.grid, idx, topologyChanged);
        this._workerNavGraphSyncChain = this._workerNavGraphSyncChain.then(run, run);
        return this._workerNavGraphSyncChain;
    }
    awaitWorkerNavReady() {
        return this._workerNavGraphSyncChain;
    }
    async _syncWorkerNavGraph(grid, idx, topologyChanged) {
        const graphEpoch = this._graphSyncGeneration + 1;
        const fullGraph = topologyChanged || idx == null;
        await this.worker.syncObstacleNavGraph(grid, idx, graphEpoch, fullGraph);
        this._graphSyncGeneration = graphEpoch;
        this._navWalkableSyncHook?.(idx);
    }
    async shutdown() {
        this.worker.shutdown();
        await this._workerNavGraphSyncChain.catch(() => {});
        await this.worker.host.worker.terminate();
    }
}
/** @param {object} state */
export function resolveNavRuntime(state) {
    if (!state?.nav) throw new Error("resolveNavRuntime: state.nav is required");
    return state.nav;
}
