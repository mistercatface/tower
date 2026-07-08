import { expandRegionDamageBounds, createNavTopologySabArena, growNavTopologyVertexSab, packNavTopologyFromGrid, buildNavComponentMap } from "../Navigation/navigation.js";
import { PathfindingWorkerClient } from "./PathfindingWorkerClient.js";
import { gridFrameFromGrid } from "../Navigation/navigation.js";
import { gridNavCacheKey, isNavTopologyReady, unionCellBounds } from "../Spatial/spatial.js";
import { createHpaWorkerSabPools, growHpaCellToRegionSab, growHpaPathIdxSab, hpaPathSlotMeta, hpaPathSlotIdx, hpaPathSlotAbstractIdx } from "./hpaWorkerSab.js";
import { gridSettings } from "../../Config/world.js";
import { navEdgePoolSabByteLength, packEdgePoolToSab } from "../Spatial/spatial.js";
export const MAX_HPA_REPLAN_SLOTS = 512;
export const MAX_HPA_PATH_LEN = 1024;
export const MAX_HPA_GRAPH_NODES = 4096 * 2;
export const MAX_HPA_ABSTRACT_LEN = MAX_HPA_GRAPH_NODES + 2;
const MAX_GRAPH_EDGES = MAX_HPA_GRAPH_NODES * 32;
const HPA_DONE = "hpaDone";
const SYNC_NAV_DONE = "syncNavDone";
const GRAPH_PATCH_DONE = "graphPatchDone";
const GRAPH_PATCH_ERROR = "graphPatchError";
const GROW_PATH_SAB_DONE = "growPathSabDone";
/**
 * Multi-slot HPA worker — persistent nav topology + abstract graph on worker thread.
 */
export class HpaPathWorker {
    constructor(workerUrl, navGraph) {
        this.workerUrl = workerUrl;
        this.navGraph = navGraph;
        this._syncedNavCacheKey = "";
        this._inFlightNavCacheKey = "";
        this._navSize = 0;
        this._gridFrame = null;
        this.sabEdgePool = new SharedArrayBuffer(navEdgePoolSabByteLength(4));
        this.navEdgePoolBytes = new Uint8Array(this.sabEdgePool);
        this._edgePoolSabRefs = 0;
        this._navSyncPromise = null;
        this._navArena = null;
        this._workerNavArenaBound = false;
        this._workerBoundNavSize = 0;
        this._workerBoundEdgePoolSab = 0;
        this._deferFullNavSync = false;
        this._deferNavBounds = undefined;
        this._graphEpoch = -1;
        this._graphPatchTargetEpoch = -1;
        this._graphPatchChain = Promise.resolve();
        this._pathSabGrowChain = Promise.resolve();
        this._pathSabGrowResolve = null;
        this._graphSize = 0;
        this._damagePadding = 12;
        this._shutDown = false;
        this._topologySyncTarget = null;
        this._debugViewCacheKey = "";
        this._debugViewCellToComponent = null;
        this.graphIdToIdx = new Map();
        this.graphNodeIds = [];
        this.graphNodeCount = 0;
        Object.assign(this, createHpaWorkerSabPools({ maxSlots: MAX_HPA_REPLAN_SLOTS, maxPathLen: MAX_HPA_PATH_LEN, maxAbstractLen: MAX_HPA_ABSTRACT_LEN, maxGraphNodes: MAX_HPA_GRAPH_NODES, maxGraphEdges: MAX_GRAPH_EDGES }));
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
        this._slotFree = [];
        for (let i = 0; i < MAX_HPA_REPLAN_SLOTS; i++) this._slotFree.push(i);
        /** @type {(object | null)[]} */
        this._replanResults = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        this.protocol = new PathfindingWorkerClient(workerUrl, MAX_HPA_REPLAN_SLOTS, "HpaPathWorker", (data) => this._handleWorkerMessage(data));
        this.host = this.protocol.host;
        this.protocol.postMessage({ type: "init", data: this._workerInitData() });
    }
    _workerInitData() {
        return { maxSlots: MAX_HPA_REPLAN_SLOTS, maxPathLen: this.maxPathLen, maxAbstractLen: MAX_HPA_ABSTRACT_LEN, maxGraphNodes: MAX_HPA_GRAPH_NODES, maxGraphEdges: MAX_GRAPH_EDGES, maxCellsPerChunk: gridSettings.maxCellsPerChunk, minCellsPerChunk: gridSettings.minCellsPerChunk, sabPathMetaPool: this.sabPathMetaPool, sabPathIdxPool: this.sabPathIdxPool, sabAbstractIdxPool: this.sabAbstractIdxPool, sabPersistGraphNodeIdx: this.sabPersistGraphNodeIdx, sabPersistGraphEdgeOffsets: this.sabPersistGraphEdgeOffsets, sabPersistGraphEdgeTargets: this.sabPersistGraphEdgeTargets, sabPersistGraphEdgeCosts: this.sabPersistGraphEdgeCosts, sabPersistGraphEdgeSources: this.sabPersistGraphEdgeSources, sabCellToRegionIdx: this.sabCellToRegionIdx };
    }
    _handleWorkerMessage(data) {
        const { type, slot, requestId } = data;
        if (type === SYNC_NAV_DONE) {
            this._syncedNavCacheKey = this._inFlightNavCacheKey || gridNavCacheKey(this.navGraph);
            this._inFlightNavCacheKey = "";
            const topologyHandle = this.getNavTopology();
            if (this._topologySyncTarget) this._topologySyncTarget.bindWorkerSync(this._gridFrame, topologyHandle);
            const resolve = this._navSyncResolve;
            this._navSyncResolve = null;
            this._navSyncPromise = null;
            resolve();
            if (this._deferFullNavSync) {
                this._deferFullNavSync = false;
                const deferredBounds = this._deferNavBounds;
                this._deferNavBounds = undefined;
                this.scheduleNavTopologySync(this.navGraph, deferredBounds === undefined ? null : deferredBounds);
            }
            return;
        }
        if (type === GRAPH_PATCH_DONE) {
            this.graphNodeCount = data.nodeCount;
            this.graphNodeIds = data.nodeIds ?? [];
            this.graphIdToIdx = new Map();
            for (let i = 0; i < this.graphNodeIds.length; i++) this.graphIdToIdx.set(this.graphNodeIds[i], i);
            this._graphEpoch = this._graphPatchTargetEpoch;
            const expectedSize = this.navGraph.cols * this.navGraph.rows;
            if (expectedSize > 0) this._ensureGraphCellBuffers(this.navGraph.cols, this.navGraph.rows);
            const resolve = this._graphPatchResolve;
            this._graphPatchResolve = null;
            resolve?.();
            return;
        }
        if (type === GRAPH_PATCH_ERROR) {
            console.error("HPA region graph patch failed:", data.message);
            const resolve = this._graphPatchResolve;
            this._graphPatchResolve = null;
            resolve?.();
            return;
        }
        if (type === GROW_PATH_SAB_DONE) {
            const resolve = this._pathSabGrowResolve;
            this._pathSabGrowResolve = null;
            resolve?.();
            return;
        }
        if (type === HPA_DONE) {
            this._replanResults[slot] = data.replanResult ?? null;
            this.protocol.markReady(slot, requestId);
            return;
        }
    }
    _ensureGraphCellBuffers(cols, rows) {
        const size = cols * rows;
        if (size <= 0) return;
        if (this._graphSize !== size) {
            this._graphSize = size;
            this.sabCellToRegionIdx = growHpaCellToRegionSab(this.sabCellToRegionIdx, size);
            this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
        }
        const stitchedMax = size;
        if (stitchedMax > this.maxPathLen) {
            this.sabPathIdxPool = growHpaPathIdxSab(this.sabPathIdxPool, MAX_HPA_REPLAN_SLOTS, stitchedMax);
            this.maxPathLen = stitchedMax;
            this.protocol.invalidateSlots();
            this._pathSabGrowChain = this._pathSabGrowChain.then(() => this._postPathSabGrow());
        }
    }
    _postPathSabGrow() {
        return new Promise((resolve) => {
            this._pathSabGrowResolve = resolve;
            this.protocol.postMessage({ type: "growPathSab", sabPathIdxPool: this.sabPathIdxPool, maxPathLen: this.maxPathLen });
        });
    }
    _postGraphPatch(type, payload, graphEpoch) {
        const run = () => {
            this._graphPatchTargetEpoch = graphEpoch;
            return new Promise((resolve) => {
                this._graphPatchResolve = resolve;
                this.protocol.postMessage({ type, sabCellToRegionIdx: this.sabCellToRegionIdx, ...payload });
            });
        };
        this._graphPatchChain = this._graphPatchChain.then(run, run);
        return this._graphPatchChain;
    }
    async syncObstacleNavGraph(grid, idx, graphEpoch, fullGraph) {
        const boundsOrIdx = fullGraph ? null : idx;
        await this.scheduleNavTopologySyncAwait(grid, boundsOrIdx);
        const size = grid.cols * grid.rows;
        this._ensureGraphCellBuffers(grid.cols, grid.rows);
        if (fullGraph) {
            await this._postGraphPatch("buildRegionGraphFull", { gridFrameKey: this._gridFrame.key, damagePadding: this._damagePadding, minCellsPerChunk: gridSettings.minCellsPerChunk }, graphEpoch);
            return;
        }
        const box = expandRegionDamageBounds(boundsOrIdx, this._gridFrame, this._damagePadding);
        await this._postGraphPatch("patchRegionGraph", { gridFrameKey: this._gridFrame.key, bounds: box }, graphEpoch);
    }
    async awaitGraphReady() {
        if (this._navSyncPromise) await this._navSyncPromise;
        await this._graphPatchChain;
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
    isRegionGraphReady(grid = this.navGraph) {
        const size = grid.cols * grid.rows;
        if (size <= 0 || this._graphSize !== size) return false;
        if (this.graphNodeCount <= 0) return false;
        return this.sabCellToRegionIdx.byteLength >> 1 >= size;
    }
    _regionGraphDebugViewCacheKey(grid) {
        return `${gridNavCacheKey(grid)}:${this._syncedNavCacheKey}:${this._graphEpoch}`;
    }
    _invalidateRegionGraphDebugViewCache() {
        this._debugViewCacheKey = "";
        this._debugViewCellToComponent = null;
    }
    getRegionGraphDebugView(grid) {
        const size = grid.cols * grid.rows;
        if (!this.isRegionGraphReady(grid)) return null;
        const nodeCount = this.graphNodeCount;
        const nodeIdx = new Int32Array(this.sabPersistGraphNodeIdx, 0, nodeCount);
        const topology = this.getNavTopology();
        const blocked = topology?.blocked ?? grid.grid;
        const cellToRegion = size > 0 ? new Int16Array(this.sabCellToRegionIdx, 0, size) : this.graphCellToRegion;
        const debugCacheKey = this._regionGraphDebugViewCacheKey(grid);
        if (this._debugViewCacheKey !== debugCacheKey) {
            this._debugViewCellToComponent = topology?.octileNeighbors ? buildNavComponentMap(blocked, topology.octileNeighbors, grid.cols, grid.rows, grid.activePortalPairs, grid.activePortalCount) : new Int16Array(size).fill(-1);
            this._debugViewCacheKey = debugCacheKey;
        }
        const cellToComponent = this._debugViewCellToComponent;
        return {
            cols: grid.cols,
            rows: grid.rows,
            minX: grid.minX,
            minY: grid.minY,
            cellSize: grid.cellSize,
            grid: blocked,
            floorPacked: grid.floorPacked,
            cellToRegion,
            cellToComponent,
            nodeCount,
            nodeIdx,
            nodeIds: this.graphNodeIds,
            gridCenterXByIdx(idx) {
                return grid.gridCenterXByIdx(idx);
            },
            gridCenterYByIdx(idx) {
                return grid.gridCenterYByIdx(idx);
            },
        };
    }
    leaseSlot() {
        const slot = this._slotFree.pop();
        if (slot === undefined) throw new Error(`HpaPathWorker slot pool exhausted (${MAX_HPA_REPLAN_SLOTS} in flight)`);
        return slot;
    }
    releaseSlot(slot) {
        this._slotFree.push(slot);
    }
    releaseOwnedPathSlot(navState) {
        if (navState.pathSlot >= 0) {
            this.releaseSlot(navState.pathSlot);
            navState.pathSlot = -1;
            navState.pathLen = 0;
        }
    }
    pathLength(slot) {
        return this._pathMeta(slot)[0];
    }
    pathIdx(slot, i) {
        return this._pathIdx(slot)[i];
    }
    abstractPathLen(slot) {
        return this._pathMeta(slot)[1];
    }
    abstractPathIdx(slot, i) {
        return this._abstractIdx(slot)[i];
    }
    graphNodeIdx(idx) {
        return new Int32Array(this.sabPersistGraphNodeIdx, 0, this.graphNodeCount)[idx];
    }
    _pathMeta(slot) {
        return hpaPathSlotMeta(this.sabPathMetaPool, slot);
    }
    _pathIdx(slot) {
        return hpaPathSlotIdx(this.sabPathIdxPool, slot, this.maxPathLen);
    }
    _abstractIdx(slot) {
        return hpaPathSlotAbstractIdx(this.sabAbstractIdxPool, slot, MAX_HPA_ABSTRACT_LEN);
    }
    _ensureNavEdgePoolSab(refCount) {
        const byteLen = navEdgePoolSabByteLength(refCount);
        if (this.sabEdgePool.byteLength >= byteLen) return;
        this.sabEdgePool = new SharedArrayBuffer(byteLen);
        this.navEdgePoolBytes = new Uint8Array(this.sabEdgePool);
    }
    _packNavEdgePoolForWorker(grid) {
        const refCount = grid.cellEdgePool.length;
        this._ensureNavEdgePoolSab(refCount);
        this._edgePoolSabRefs = packEdgePoolToSab(grid, this.navEdgePoolBytes);
    }
    _syncNavArenaFields() {
        const arena = this._navArena;
        this.sabBlocked = arena.sabBlocked;
        this.sabGridFill = arena.sabGridFill;
        this.sabFloorPacked = arena.sabFloorPacked;
        this.sabActivePortalPairs = arena.sabActivePortalPairs;
        this.sabActivePortalCount = arena.sabActivePortalCount;
        this.sabEdgeSlots = arena.sabEdgeSlots;
        this.sabOctileNeighbors = arena.sabOctileNeighbors;
        this.sabOctilePredecessors = arena.sabOctilePredecessors;
        this.sabCardinalOpen = arena.sabCardinalOpen;
        this.sabVertexPassability = arena.sabVertexPassability;
    }
    _ensureNavBuffers(size, vertCount, edgePoolRefs = 4, cols = 0, rows = 0) {
        this._ensureNavEdgePoolSab(edgePoolRefs);
        if (this._navSize !== size) {
            this._navSize = size;
            this._navArena = createNavTopologySabArena(size, vertCount, cols, rows);
        } else growNavTopologyVertexSab(this._navArena, vertCount);
        this._syncNavArenaFields();
    }
    getNavTopology() {
        return this._navArena?.topologyHandle ?? null;
    }
    getNavArena() {
        return this._navArena;
    }
    /** @param {import("../Navigation/NavTopology.js").NavTopology | null} target */
    setTopologySyncTarget(target) {
        this._topologySyncTarget = target;
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
    ensureNavArenaForGrid(grid) {
        const size = grid.cols * grid.rows;
        if (size <= 0) return;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        this._ensureNavBuffers(size, vertCount, Math.max(grid.cellEdgePool.length, 4), grid.cols, grid.rows);
    }
    getGridFrame() {
        return this._gridFrame;
    }
    getNavBlockedSab() {
        return this.sabBlocked;
    }
    getNavOctilePredecessorsSab() {
        return this.sabOctilePredecessors;
    }
    async scheduleNavTopologySyncAwait(grid = this.navGraph, damageBounds = null) {
        while (!this._shutDown && (damageBounds != null || !isNavTopologyReady(this, grid))) {
            this.scheduleNavTopologySync(grid, damageBounds);
            if (this._shutDown) return;
            if (this._navSyncPromise) await this._navSyncPromise;
            else break;
            if (damageBounds != null) break;
        }
    }
    _navTopologySyncMessage(grid, cacheKey, rebindArena, damageBounds) {
        this._gridFrame = gridFrameFromGrid(grid);
        const payload = { type: "buildNavTopology", navCacheKey: cacheKey, gridFrame: this._gridFrame, edgePoolCount: this._edgePoolSabRefs, rebindArena, damageBounds };
        if (!rebindArena) return payload;
        return { ...payload, sabBlocked: this.sabBlocked, sabCardinalOpen: this.sabCardinalOpen, sabVertexPassability: this.sabVertexPassability, sabOctileNeighbors: this.sabOctileNeighbors, sabOctilePredecessors: this.sabOctilePredecessors, sabEdgePool: this.sabEdgePool, sabGridFill: this.sabGridFill, sabFloorPacked: this.sabFloorPacked, sabActivePortalPairs: this.sabActivePortalPairs, sabActivePortalCount: this.sabActivePortalCount, sabEdgeSlots: this.sabEdgeSlots };
    }
    _deferNavDamageBounds(grid, damageBounds) {
        const frame = this._gridFrame ?? gridFrameFromGrid(grid);
        if (typeof damageBounds === "number") {
            const col = damageBounds % frame.cols;
            const row = (damageBounds / frame.cols) | 0;
            return { startCol: col, endCol: col, startRow: row, endRow: row };
        }
        return { startCol: damageBounds.startCol, endCol: damageBounds.endCol, startRow: damageBounds.startRow, endRow: damageBounds.endRow };
    }
    scheduleNavTopologySync(grid = this.navGraph, damageBounds = null) {
        if (this._shutDown || (damageBounds == null && isNavTopologyReady(this, grid))) return;
        if (this._navSyncPromise) {
            this._deferFullNavSync = true;
            if (damageBounds == null) this._deferNavBounds = null;
            else if (this._deferNavBounds !== null) {
                const box = this._deferNavDamageBounds(grid, damageBounds);
                if (this._deferNavBounds !== undefined) this._deferNavBounds = unionCellBounds(this._deferNavBounds, box);
                else this._deferNavBounds = box;
            }
            return;
        }
        const size = grid.cols * grid.rows;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        this._ensureGraphCellBuffers(grid.cols, grid.rows);
        this._inFlightNavCacheKey = gridNavCacheKey(grid);
        const edgePoolRefs = Math.max(grid.cellEdgePool.length, 4);
        this._ensureNavBuffers(size, vertCount, edgePoolRefs, grid.cols, grid.rows);
        const rebindArena = !this._workerNavArenaBound || this._workerBoundNavSize !== size || this._workerBoundEdgePoolSab !== this.sabEdgePool.byteLength;
        packNavTopologyFromGrid(grid, this._navArena, rebindArena ? null : damageBounds);
        this._syncNavArenaFields();
        this._packNavEdgePoolForWorker(grid);
        if (rebindArena) {
            this._workerNavArenaBound = true;
            this._workerBoundNavSize = size;
            this._workerBoundEdgePoolSab = this.sabEdgePool.byteLength;
        }
        this._navSyncPromise = new Promise((resolve) => {
            this._navSyncResolve = resolve;
            this.protocol.postMessage(this._navTopologySyncMessage(grid, this._inFlightNavCacheKey, rebindArena, rebindArena ? null : damageBounds));
        });
    }
    async _ensureWorkerGraphReady(graphEpoch) {
        await this.awaitGraphReady();
        return this._graphEpoch >= graphEpoch && this.graphNodeCount > 0;
    }
    recycleWorker() {
        console.warn("HpaPathWorker: Web Worker hung or timed out. Recycling worker thread...");
        this._recycleWorkerThread();
    }
    _recycleWorkerThread() {
        this.protocol.recycleWorker();
        this._workerNavArenaBound = false;
        this._syncedNavCacheKey = "";
        this._inFlightNavCacheKey = "";
        this._graphEpoch = -1;
        this._graphPatchTargetEpoch = -1;
        this.protocol.invalidateSlots();
        if (this._navSyncResolve) {
            this._navSyncResolve();
            this._navSyncResolve = null;
        }
        if (this._graphPatchResolve) {
            this._graphPatchResolve();
            this._graphPatchResolve = null;
        }
        this.protocol.postMessage({ type: "init", data: this._workerInitData() });
    }
    async _dispatchAndWait(slot, type, extra) {
        const requestId = this.protocol.postSlot(slot, { type, ...extra });
        let timer;
        const mainPromise = this.protocol.waitForSlot(slot, requestId);
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error("Worker request timeout"));
            }, 2500);
        });
        try {
            await Promise.race([mainPromise, timeoutPromise]);
        } catch (err) {
            if (err.message === "Worker request timeout") this.recycleWorker();
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }
    async runOneShotReplan(slot, request) {
        await this._pathSabGrowChain;
        await this._dispatchAndWait(slot, "replan", { ...request.toWorkerPayload(), sabPathIdxPool: this.sabPathIdxPool, maxPathLen: this.maxPathLen });
        const result = this._replanResults[slot];
        this._replanResults[slot] = null;
        if (!result) return null;
        return { complete: true, result };
    }
    async requestPath(request, navState) {
        await this.scheduleNavTopologySyncAwait(request.obstacleGrid, null);
        if (!isNavTopologyReady(this, request.obstacleGrid)) return null;
        this.releaseOwnedPathSlot(navState);
        if (this._graphEpoch < request.graphEpoch) await this.syncObstacleNavGraph(request.obstacleGrid, null, request.graphEpoch, true);
        if (!(await this._ensureWorkerGraphReady(request.graphEpoch))) return null;
        const slot = this.leaseSlot();
        let workerOut = null;
        try {
            workerOut = await this.runOneShotReplan(slot, request);
        } catch (err) {
            this.releaseSlot(slot);
            throw err;
        }
        if (!workerOut) {
            this.releaseSlot(slot);
            return null;
        }
        workerOut.result.pathSlot = slot;
        return workerOut;
    }
    /** Release pending slot waiters and worker handlers before thread termination (tests). */
    shutdown() {
        this._shutDown = true;
        this.protocol.shutdown();
        this._navSyncPromise = null;
        if (this._navSyncResolve) {
            this._navSyncResolve();
            this._navSyncResolve = null;
        }
        this._graphPatchChain = Promise.resolve();
        if (this._graphPatchResolve) {
            this._graphPatchResolve();
            this._graphPatchResolve = null;
        }
    }
}
