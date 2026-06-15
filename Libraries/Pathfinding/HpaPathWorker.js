import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
import { packHpaGraphForWorker, MAX_HPA_GRAPH_NODES } from "./hpaAbstractFlat.js";
import {
    bakeHopCsr,
    copyNavTopologySlicesIntoRect,
    createWorkerNavSnapshotView,
    expandCellBoundsForNavPatch,
    NAV_TOPOLOGY_OCTILE_SHELL,
    packBlockedFromGrid,
    packBlockedIntoRect,
    snapshotNavCacheKey,
} from "./GridNavSnapshot.js";
import { buildHpaReplanResult, prepareHpaReplanPrep, resolveSnappedPathEndpoints } from "./hpaPathRequest.js";
import { isEmptyCellBounds, unionCellBounds } from "../DataStructures/CellRect.js";
import { gridSettings } from "../../Config/balance/grid.js";
export const MAX_HPA_REPLAN_SLOTS = 512;
export const MAX_HPA_PATH_LEN = 512;
export const MAX_HPA_ABSTRACT_LEN = 64;
const MAX_GRAPH_EDGES = MAX_HPA_GRAPH_NODES * 32;
const HPA_DONE = "hpaDone";
const ABSTRACT_READY = "abstractReady";
const SYNC_NAV_DONE = "syncNavDone";
const GRAPH_SYNC_DONE = "graphSyncDone";
/**
 * Multi-slot HPA worker — persistent nav snapshot + abstract graph on worker thread.
 */
export class HpaPathWorker {
    constructor(workerUrl, navGraph) {
        this.navGraph = navGraph;
        this.host = createSabSlotWorkerHost(workerUrl, MAX_HPA_REPLAN_SLOTS);
        this._navKey = "";
        this._navSize = 0;
        this._navSyncPromise = null;
        this._navSnapshotView = null;
        this._lastGridTopologyEpoch = -1;
        /** @type {import("../DataStructures/CellRect.js").CellBounds | null} */
        this._pendingPatchBounds = null;
        this._deferFullNavSync = false;
        this._graphEpoch = -1;
        this._graphSyncTargetEpoch = -1;
        this._graphSyncPromise = null;
        this.graphIdToIdx = new Map();
        this.graphNodeIds = [];
        this.graphNodeCol = new Int16Array(0);
        this.graphNodeRow = new Int16Array(0);
        this.graphNodeCount = 0;
        this._slotFree = [];
        for (let i = 0; i < MAX_HPA_REPLAN_SLOTS; i++) this._slotFree.push(i);
        this._slotOwner = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        /** @type {Array<{ requestId: number, onAbstractReady?: (result: object) => void, prep: object, obstacleGrid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid } | null>} */
        this._replanHooks = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        this.sabPathMetaPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * 8);
        this.sabPathColsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_PATH_LEN * 2);
        this.sabPathRowsPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_PATH_LEN * 2);
        this.sabAbstractIdxPool = new SharedArrayBuffer(MAX_HPA_REPLAN_SLOTS * MAX_HPA_ABSTRACT_LEN * 2);
        this.sabPersistGraphNodeCol = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 2);
        this.sabPersistGraphNodeRow = new SharedArrayBuffer(MAX_HPA_GRAPH_NODES * 2);
        this.sabPersistGraphEdgeOffsets = new SharedArrayBuffer((MAX_HPA_GRAPH_NODES + 1) * 4);
        this.sabPersistGraphEdgeTargets = new SharedArrayBuffer(MAX_GRAPH_EDGES * 2);
        this.sabPersistGraphEdgeCosts = new SharedArrayBuffer(MAX_GRAPH_EDGES * 2);
        this.sabPersistGraphEdgeSources = new SharedArrayBuffer(MAX_GRAPH_EDGES * 2);
        this.host.worker.onmessage = (e) => {
            const { type, slot, requestId } = e.data;
            if (type === SYNC_NAV_DONE) {
                this._navSnapshotView = createWorkerNavSnapshotView(this.navGraph, this._navKey, this.navBlocked, this.navOctileNeighbors, this.navHopOffsets, this.navHopExitIdx, this.navHopCost);
                this.navGraph.gridNavSnapshot = null;
                const resolve = this._navSyncResolve;
                this._navSyncResolve = null;
                this._navSyncPromise = null;
                resolve();
                if (this._deferFullNavSync) {
                    this._deferFullNavSync = false;
                    this.scheduleNavTopologySync(this.navGraph);
                }
                return;
            }
            if (type === GRAPH_SYNC_DONE) {
                this._graphEpoch = this._graphSyncTargetEpoch;
                const resolve = this._graphSyncResolve;
                this._graphSyncResolve = null;
                this._graphSyncPromise = null;
                resolve();
                return;
            }
            if (type === ABSTRACT_READY) {
                const hook = this._replanHooks[slot];
                if (hook && hook.requestId === requestId) {
                    const abstractIdx = this._readAbstractIdx(slot);
                    const abstractResult = buildHpaReplanResult(hook.obstacleGrid, hook.prep, abstractIdx, 0);
                    if (abstractResult) hook.onAbstractReady?.(abstractResult);
                }
                return;
            }
            if (type === HPA_DONE) this.host.markReady(slot, requestId);
        };
        this.host.worker.postMessage({
            type: "init",
            data: {
                maxSlots: MAX_HPA_REPLAN_SLOTS,
                maxPathLen: MAX_HPA_PATH_LEN,
                maxAbstractLen: MAX_HPA_ABSTRACT_LEN,
                maxGraphNodes: MAX_HPA_GRAPH_NODES,
                maxGraphEdges: MAX_GRAPH_EDGES,
                maxCellsPerChunk: gridSettings.maxCellsPerChunk,
                sabPathMetaPool: this.sabPathMetaPool,
                sabPathColsPool: this.sabPathColsPool,
                sabPathRowsPool: this.sabPathRowsPool,
                sabAbstractIdxPool: this.sabAbstractIdxPool,
                sabPersistGraphNodeCol: this.sabPersistGraphNodeCol,
                sabPersistGraphNodeRow: this.sabPersistGraphNodeRow,
                sabPersistGraphEdgeOffsets: this.sabPersistGraphEdgeOffsets,
                sabPersistGraphEdgeTargets: this.sabPersistGraphEdgeTargets,
                sabPersistGraphEdgeCosts: this.sabPersistGraphEdgeCosts,
                sabPersistGraphEdgeSources: this.sabPersistGraphEdgeSources,
            },
        });
    }
    leaseSlot(owner) {
        const slot = this._slotFree.pop();
        if (slot === undefined) throw new Error(`HpaPathWorker slot pool exhausted (${MAX_HPA_REPLAN_SLOTS} in flight)`);
        this._slotOwner[slot] = owner;
        return slot;
    }
    releaseSlot(slot) {
        this._slotOwner[slot] = null;
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
    pathCol(slot, i) {
        return this._pathCols(slot)[i];
    }
    pathRow(slot, i) {
        return this._pathRows(slot)[i];
    }
    inFlightCount() {
        return MAX_HPA_REPLAN_SLOTS - this._slotFree.length;
    }
    _pathMeta(slot) {
        return new Int32Array(this.sabPathMetaPool, slot * 8, 2);
    }
    _pathCols(slot) {
        return new Int16Array(this.sabPathColsPool, slot * MAX_HPA_PATH_LEN * 2, MAX_HPA_PATH_LEN);
    }
    _pathRows(slot) {
        return new Int16Array(this.sabPathRowsPool, slot * MAX_HPA_PATH_LEN * 2, MAX_HPA_PATH_LEN);
    }
    _abstractIdx(slot) {
        return new Int16Array(this.sabAbstractIdxPool, slot * MAX_HPA_ABSTRACT_LEN * 2, MAX_HPA_ABSTRACT_LEN);
    }
    _ensureNavBuffers(size, hopExitLen, hopCostLen, vertCount) {
        if (this._navSize !== size) {
            this._navSize = size;
            this.sabBlocked = new SharedArrayBuffer(size);
            this.sabOctileNeighbors = new SharedArrayBuffer(size * 8 * 4);
            this.sabHopOffsets = new SharedArrayBuffer((size + 1) * 4);
            this.sabHopExitIdx = new SharedArrayBuffer(Math.max(hopExitLen, 4));
            this.sabHopCost = new SharedArrayBuffer(Math.max(hopCostLen, 4));
            this.sabCardinalOpen = new SharedArrayBuffer(size);
            this.sabVertexPassability = new SharedArrayBuffer(Math.max(vertCount, 4));
            this.navBlocked = new Uint8Array(this.sabBlocked);
            this.navOctileNeighbors = new Int32Array(this.sabOctileNeighbors);
            this.navHopOffsets = new Int32Array(this.sabHopOffsets);
            this.navHopExitIdx = new Int32Array(this.sabHopExitIdx);
            this.navHopCost = new Uint8Array(this.sabHopCost);
            this.navCardinalOpen = new Uint8Array(this.sabCardinalOpen);
            this.navVertexPassability = new Uint8Array(this.sabVertexPassability);
        } else if (hopExitLen > this.sabHopExitIdx.byteLength) {
            this.sabHopExitIdx = new SharedArrayBuffer(hopExitLen);
            this.sabHopCost = new SharedArrayBuffer(hopCostLen);
            this.navHopExitIdx = new Int32Array(this.sabHopExitIdx);
            this.navHopCost = new Uint8Array(this.sabHopCost);
        }
        if (vertCount > this.sabVertexPassability.byteLength) {
            this.sabVertexPassability = new SharedArrayBuffer(vertCount);
            this.navVertexPassability = new Uint8Array(this.sabVertexPassability);
        }
    }
    getNavSnapshotView() {
        return this._navSnapshotView;
    }
    navCacheKey() {
        return this._navKey;
    }
    _canIncrementalPatch(grid) {
        const size = grid.cols * grid.rows;
        return this._navSize === size && size > 0 && this._navKey !== "" && this.navBlocked;
    }
    scheduleNavTopologySync(grid = this.navGraph) {
        const cacheKey = snapshotNavCacheKey(grid);
        if (cacheKey === this._navKey) return;
        if (this._navSyncPromise) return;
        this._pendingPatchBounds = null;
        this._lastGridTopologyEpoch = grid.gridTopologyEpoch;
        this._navKey = cacheKey;
        this._navSnapshotView = null;
        this.navGraph.gridNavSnapshot = null;
        const size = grid.cols * grid.rows;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        const blocked = packBlockedFromGrid(grid);
        const hops = bakeHopCsr(grid, blocked, grid.cols, grid.rows);
        this._ensureNavBuffers(size, hops.hopExitIdx.byteLength, hops.hopCost.byteLength, vertCount);
        this.navBlocked.set(blocked);
        this.navCardinalOpen.set(grid.navCardinalOpen);
        this.navVertexPassability.set(grid.vertexPassability);
        this.navHopOffsets.set(hops.hopOffsets);
        this.navHopExitIdx.set(hops.hopExitIdx);
        this.navHopCost.set(hops.hopCost);
        this._navSyncPromise = new Promise((resolve) => {
            this._navSyncResolve = resolve;
            this.host.worker.postMessage({
                type: "buildNavSnapshot",
                cols: grid.cols,
                rows: grid.rows,
                sabBlocked: this.sabBlocked,
                sabCardinalOpen: this.sabCardinalOpen,
                sabVertexPassability: this.sabVertexPassability,
                sabHopOffsets: this.sabHopOffsets,
                sabHopExitIdx: this.sabHopExitIdx,
                sabHopCost: this.sabHopCost,
                sabOctileNeighbors: this.sabOctileNeighbors,
            });
        });
    }
    _fallbackToFullNavSync(grid) {
        this._pendingPatchBounds = null;
        if (this._navSyncPromise) {
            this._deferFullNavSync = true;
            return;
        }
        this.scheduleNavTopologySync(grid);
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../DataStructures/CellRect.js").CellBounds} bounds */
    patchNavTopology(grid, bounds) {
        const cacheKey = snapshotNavCacheKey(grid);
        if (cacheKey === this._navKey) return;
        if (isEmptyCellBounds(bounds) || grid.gridTopologyEpoch !== this._lastGridTopologyEpoch || !this._canIncrementalPatch(grid)) {
            this._fallbackToFullNavSync(grid);
            return;
        }
        this._pendingPatchBounds = unionCellBounds(this._pendingPatchBounds, bounds);
        if (this._navSyncPromise) return;
        void this._drainNavTopologySync(grid);
    }
    async _drainNavTopologySync(grid) {
        try {
            while (this._pendingPatchBounds) {
                const dataBounds = expandCellBoundsForNavPatch(this._pendingPatchBounds, grid.cols, grid.rows);
                const octileBounds = expandCellBoundsForNavPatch(dataBounds, grid.cols, grid.rows, NAV_TOPOLOGY_OCTILE_SHELL);
                this._pendingPatchBounds = null;
                const cacheKey = snapshotNavCacheKey(grid);
                if (cacheKey === this._navKey) continue;
                this._navKey = cacheKey;
                this._lastGridTopologyEpoch = grid.gridTopologyEpoch;
                this._navSnapshotView = null;
                this.navGraph.gridNavSnapshot = null;
                packBlockedIntoRect(grid, dataBounds, this.navBlocked);
                copyNavTopologySlicesIntoRect(grid, dataBounds, this.navCardinalOpen, this.navVertexPassability);
                const hops = bakeHopCsr(grid, this.navBlocked, grid.cols, grid.rows);
                this._ensureNavBuffers(grid.cols * grid.rows, hops.hopExitIdx.byteLength, hops.hopCost.byteLength, (grid.cols + 1) * (grid.rows + 1));
                this.navHopOffsets.set(hops.hopOffsets);
                this.navHopExitIdx.set(hops.hopExitIdx);
                this.navHopCost.set(hops.hopCost);
                this._navSyncPromise = new Promise((resolve) => {
                    this._navSyncResolve = resolve;
                    this.host.worker.postMessage({
                        type: "patchNavSnapshot",
                        cols: grid.cols,
                        rows: grid.rows,
                        startCol: octileBounds.startCol,
                        endCol: octileBounds.endCol,
                        startRow: octileBounds.startRow,
                        endRow: octileBounds.endRow,
                        sabBlocked: this.sabBlocked,
                        sabCardinalOpen: this.sabCardinalOpen,
                        sabVertexPassability: this.sabVertexPassability,
                        sabHopOffsets: this.sabHopOffsets,
                        sabHopExitIdx: this.sabHopExitIdx,
                        sabHopCost: this.sabHopCost,
                        sabOctileNeighbors: this.sabOctileNeighbors,
                    });
                });
                await this._navSyncPromise;
            }
        } finally {
            if (this._pendingPatchBounds && snapshotNavCacheKey(grid) !== this._navKey) void this._drainNavTopologySync(grid);
        }
    }
    async _ensureWorkerNavReady() {
        const grid = this.navGraph;
        const cacheKey = snapshotNavCacheKey(grid);
        if (cacheKey !== this._navKey) this.scheduleNavTopologySync(grid);
        if (this._navSyncPromise) await this._navSyncPromise;
    }
    syncAbstractGraph(navigator, graphEpoch) {
        if (graphEpoch === this._graphEpoch && this.graphNodeCount > 0) return;
        if (this._graphSyncPromise) return;
        const nodeIds = Object.keys(navigator.nodesMap).filter((id) => !id.startsWith("__hpa_"));
        if (nodeIds.length > MAX_HPA_GRAPH_NODES) throw new Error(`HPA abstract graph has ${nodeIds.length} nodes (max ${MAX_HPA_GRAPH_NODES})`);
        const packed = packHpaGraphForWorker(navigator.nodesMap, nodeIds);
        this.graphIdToIdx = packed.idToIdx;
        this.graphNodeIds = packed.nodeIds;
        this.graphNodeCol = packed.nodeCol;
        this.graphNodeRow = packed.nodeRow;
        this.graphNodeCount = packed.nodeCount;
        this._graphEdgeWrite = packed.edgeWrite;
        this._graphSyncTargetEpoch = graphEpoch;
        const persistNodeCol = new Int16Array(this.sabPersistGraphNodeCol);
        const persistNodeRow = new Int16Array(this.sabPersistGraphNodeRow);
        const persistEdgeSources = new Int16Array(this.sabPersistGraphEdgeSources);
        const persistEdgeTargets = new Int16Array(this.sabPersistGraphEdgeTargets);
        const persistEdgeCosts = new Uint16Array(this.sabPersistGraphEdgeCosts);
        persistNodeCol.set(packed.nodeCol);
        persistNodeRow.set(packed.nodeRow);
        persistEdgeSources.set(packed.edgeSources);
        persistEdgeTargets.set(packed.edgeTargets);
        persistEdgeCosts.set(packed.edgeCosts);
        this._graphSyncPromise = new Promise((resolve) => {
            this._graphSyncResolve = resolve;
            this.host.worker.postMessage({ type: "syncAbstractGraph", nodeCount: packed.nodeCount, edgeWrite: packed.edgeWrite });
        });
    }
    async _ensureWorkerGraphReady(navigator, graphEpoch) {
        this.syncAbstractGraph(navigator, graphEpoch);
        if (this._graphSyncPromise) await this._graphSyncPromise;
    }
    async _dispatchAndWait(slot, type, extra) {
        const requestId = this.host.post(slot, { type, ...extra });
        await this.host.waitForSlot(slot, requestId);
    }
    _readAbstractIdx(slot) {
        const pathMeta = this._pathMeta(slot);
        const len = pathMeta[1];
        if (len <= 0) return [];
        const abstractIdx = this._abstractIdx(slot);
        const out = new Array(len);
        for (let i = 0; i < len; i++) out[i] = abstractIdx[i];
        return out;
    }
    getGraphMeta() {
        return { nodeCount: this.graphNodeCount, nodeIds: this.graphNodeIds, nodeCol: this.graphNodeCol, nodeRow: this.graphNodeRow, idToIdx: this.graphIdToIdx };
    }
    async runOneShotReplan(slot, prep, obstacleGrid, graphEpoch, replanCtx = null) {
        await this._ensureWorkerNavReady();
        await this._ensureWorkerGraphReady(replanCtx?.navigator, graphEpoch);
        const payload = { mode: prep.mode, startCol: prep.startCol, startRow: prep.startRow, targetCol: prep.targetCol, targetRow: prep.targetRow, localMaxLen: 96 };
        if (prep.mode === "hpa") {
            payload.regionConnectMaxLen = prep.regionConnectMaxLen;
            if (replanCtx?.onAbstractReady && replanCtx.replanRequestId != null)
                this._replanHooks[slot] = { requestId: replanCtx.replanRequestId, onAbstractReady: replanCtx.onAbstractReady, prep, obstacleGrid };
        }
        try {
            await this._dispatchAndWait(slot, "replan", payload);
        } finally {
            this._replanHooks[slot] = null;
        }
        const abstractIdx = this._readAbstractIdx(slot);
        const pathLen = this.pathLength(slot);
        const result = buildHpaReplanResult(obstacleGrid, prep, abstractIdx, pathLen);
        if (!result) return null;
        return { complete: true, result };
    }
    /**
     * @param {{
     *   obstacleGrid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid,
     *   navigator: import("./HierarchicalNavigator.js").HierarchicalNavigator,
     *   startX: number, startY: number, targetX: number, targetY: number,
     *   graphEpoch: number, navState: import("./navSession.js").NavSessionState,
     *   replanRequestId: number,
     *   onAbstractReady?: (result: object) => void,
     * }} opts
     */
    async requestPath(opts) {
        const { obstacleGrid, navigator, startX, startY, targetX, targetY, graphEpoch, navState, replanRequestId, onAbstractReady } = opts;
        this.releaseOwnedPathSlot(navState);
        const { startCol, startRow, targetCol, targetRow } = resolveSnappedPathEndpoints(obstacleGrid, navigator, startX, startY, targetX, targetY);
        const prep = prepareHpaReplanPrep(navigator, this.getGraphMeta(), startCol, startRow, targetCol, targetRow);
        const slot = this.leaseSlot(navState);
        navState.hpaReplanSlot = slot;
        const replanCtx = { navigator, replanRequestId, onAbstractReady, prep, obstacleGrid };
        let workerOut = null;
        try {
            workerOut = await this.runOneShotReplan(slot, prep, obstacleGrid, graphEpoch, replanCtx);
        } catch (err) {
            this.releaseSlot(slot);
            throw err;
        }
        navState.hpaReplanSlot = -1;
        if (!workerOut) {
            this.releaseSlot(slot);
            return null;
        }
        workerOut.result.pathSlot = slot;
        workerOut.result.pathLen = this.pathLength(slot);
        return workerOut;
    }
}
