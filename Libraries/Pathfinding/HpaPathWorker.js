import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
import { expandRegionDamageBounds } from "./hpaRegionGraph.js";
import {
    copyNavSimSabRect,
    createSnapshotLocalNavView,
    createWorkerNavSnapshotView,
    expandCellBoundsForNavPatch,
    NAV_TOPOLOGY_OCTILE_SHELL,
    packBlockedFromGrid,
    packBlockedIntoRect,
    packNavSimSabFromGrid,
    snapshotCanStep,
    snapshotNavCacheKey,
} from "./GridNavSnapshot.js";
import { buildHpaReplanResult, resolveSnappedPathEndpoints } from "./hpaPathRequest.js";
import { isEmptyCellBounds, unionCellBounds } from "../DataStructures/CellRect.js";
import { gridSettings } from "../../Config/balance/grid.js";
import { stampPassageNetworkIdsOnGrid } from "./navSimHopBake.js";
export const MAX_HPA_REPLAN_SLOTS = 512;
export const MAX_HPA_PATH_LEN = 512;
export const MAX_HPA_ABSTRACT_LEN = 64;
export const MAX_HPA_GRAPH_NODES = 4096;
const MAX_GRAPH_EDGES = MAX_HPA_GRAPH_NODES * 32;
const HPA_DONE = "hpaDone";
const ABSTRACT_READY = "abstractReady";
const SYNC_NAV_DONE = "syncNavDone";
const GRAPH_PATCH_DONE = "graphPatchDone";
const GRAPH_PATCH_ERROR = "graphPatchError";
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
        this._graphPatchTargetEpoch = -1;
        this._graphPatchChain = Promise.resolve();
        this._graphSize = 0;
        this._damagePadding = 12;
        /** @type {(() => void) | null} */
        this.onGraphPatched = null;
        this.graphIdToIdx = new Map();
        this.graphNodeIds = [];
        this.graphNodeCol = new Int16Array(0);
        this.graphNodeRow = new Int16Array(0);
        this.graphNodeCount = 0;
        this.graphEdgeOffsets = new Int32Array(0);
        this.graphCellToRegion = new Int16Array(0);
        this._slotFree = [];
        for (let i = 0; i < MAX_HPA_REPLAN_SLOTS; i++) this._slotFree.push(i);
        this._slotOwner = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        /** @type {Array<{ requestId: number, onAbstractReady?: (result: object) => void, obstacleGrid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, startCol: number, startRow: number, targetCol: number, targetRow: number } | null>} */
        this._replanHooks = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        /** @type {("local" | "hpa" | null)[]} */
        this._replanSlotMode = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
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
        this.sabCellToRegionIdx = new SharedArrayBuffer(4);
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
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
            if (type === GRAPH_PATCH_DONE) {
                this.graphNodeCount = e.data.nodeCount;
                this.graphNodeIds = e.data.nodeIds ?? [];
                this.graphIdToIdx = new Map();
                for (let i = 0; i < this.graphNodeIds.length; i++) this.graphIdToIdx.set(this.graphNodeIds[i], i);
                this._graphEpoch = this._graphPatchTargetEpoch;
                this._mirrorGraphFromSab();
                const resolve = this._graphPatchResolve;
                this._graphPatchResolve = null;
                resolve?.();
                this.onGraphPatched?.();
                return;
            }
            if (type === GRAPH_PATCH_ERROR) {
                console.error("HPA region graph patch failed:", e.data.message);
                const resolve = this._graphPatchResolve;
                this._graphPatchResolve = null;
                resolve?.();
                return;
            }
            if (type === ABSTRACT_READY) {
                const hook = this._replanHooks[slot];
                if (hook && hook.requestId === requestId) {
                    const prep = this._buildReplanResultPrep("hpa", hook.startCol, hook.startRow, hook.targetCol, hook.targetRow);
                    const abstractIdx = this._readAbstractIdx(slot);
                    const abstractResult = buildHpaReplanResult(hook.obstacleGrid, prep, abstractIdx, 0);
                    if (abstractResult) hook.onAbstractReady?.(abstractResult);
                }
                return;
            }
            if (type === HPA_DONE) {
                this._replanSlotMode[slot] = e.data.replanMode === "hpa" ? "hpa" : "local";
                this.host.markReady(slot, requestId);
                return;
            }
        };
        this.host.worker.onerror = (err) => console.error("HpaPathWorker error:", err.message);
        this.host.worker.postMessage({
            type: "init",
            data: {
                maxSlots: MAX_HPA_REPLAN_SLOTS,
                maxPathLen: MAX_HPA_PATH_LEN,
                maxAbstractLen: MAX_HPA_ABSTRACT_LEN,
                maxGraphNodes: MAX_HPA_GRAPH_NODES,
                maxGraphEdges: MAX_GRAPH_EDGES,
                maxCellsPerChunk: gridSettings.maxCellsPerChunk,
                minCellsPerChunk: gridSettings.minCellsPerChunk,
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
                sabCellToRegionIdx: this.sabCellToRegionIdx,
            },
        });
    }
    _ensureGraphCellBuffers(size) {
        if (this._graphSize === size) return;
        this._graphSize = size;
        this.sabCellToRegionIdx = new SharedArrayBuffer(Math.max(size * 2, 4));
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
    }
    _mirrorGraphFromSab() {
        const nodeCount = this.graphNodeCount;
        const expectedSize = this.navGraph.cols * this.navGraph.rows;
        if (expectedSize > 0 && this._graphSize !== expectedSize) this._ensureGraphCellBuffers(expectedSize);
        this.graphNodeCol = new Int16Array(this.sabPersistGraphNodeCol, 0, nodeCount);
        this.graphNodeRow = new Int16Array(this.sabPersistGraphNodeRow, 0, nodeCount);
        this.graphEdgeOffsets = new Int32Array(this.sabPersistGraphEdgeOffsets, 0, nodeCount + 1);
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx, 0, this._graphSize);
    }
    _postGraphPatch(type, payload, graphEpoch) {
        const run = () => {
            this._graphPatchTargetEpoch = graphEpoch;
            return new Promise((resolve) => {
                this._graphPatchResolve = resolve;
                this.host.worker.postMessage({ type, sabCellToRegionIdx: this.sabCellToRegionIdx, ...payload });
            });
        };
        this._graphPatchChain = this._graphPatchChain.then(run, run);
        return this._graphPatchChain;
    }
    async buildRegionGraphFull(grid, seedWorldX = null, seedWorldY = null, graphEpoch = 0) {
        await this.scheduleNavTopologySyncAwait(grid);
        const size = grid.cols * grid.rows;
        this._ensureGraphCellBuffers(size);
        this.setPruneSeed(seedWorldX, seedWorldY);
        await this._postGraphPatch(
            "buildRegionGraphFull",
            {
                cols: grid.cols,
                rows: grid.rows,
                minX: grid.minX,
                minY: grid.minY,
                cellSize: grid.cellSize,
                damagePadding: this._damagePadding,
                minCellsPerChunk: gridSettings.minCellsPerChunk,
                seedWorldX,
                seedWorldY,
            },
            graphEpoch,
        );
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../DataStructures/CellRect.js").CellBounds} bounds @param {number} graphEpoch */
    async patchRegionGraph(grid, bounds, graphEpoch) {
        await this.scheduleNavTopologySyncAwait(grid);
        const size = grid.cols * grid.rows;
        this._ensureGraphCellBuffers(size);
        const box = expandRegionDamageBounds(bounds, grid.cols, grid.rows, this._damagePadding);
        await this._postGraphPatch(
            "patchRegionGraph",
            {
                cols: grid.cols,
                rows: grid.rows,
                startCol: box.startCol,
                endCol: box.endCol,
                startRow: box.startRow,
                endRow: box.endRow,
                seedWorldX: this._pruneSeedWorldX ?? null,
                seedWorldY: this._pruneSeedWorldY ?? null,
            },
            graphEpoch,
        );
    }
    async awaitGraphReady() {
        if (this._navSyncPromise) await this._navSyncPromise;
        await this._graphPatchChain;
    }
    setPruneSeed(worldX, worldY) {
        this._pruneSeedWorldX = worldX;
        this._pruneSeedWorldY = worldY;
    }
    getCellToRegionView() {
        return this.graphCellToRegion;
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
    isRegionGraphReady(grid = this.navGraph) {
        const size = grid.cols * grid.rows;
        if (size <= 0 || this.graphNodeCount <= 0 || this._graphSize !== size) return false;
        return this.sabCellToRegionIdx.byteLength >> 1 >= size;
    }
    getRegionGraphDebugView(grid) {
        const size = grid.cols * grid.rows;
        if (!this.isRegionGraphReady(grid)) return null;
        const nodeCount = this.graphNodeCount;
        const nodeCol = nodeCount > 0 ? new Int16Array(this.sabPersistGraphNodeCol, 0, nodeCount) : this.graphNodeCol;
        const nodeRow = nodeCount > 0 ? new Int16Array(this.sabPersistGraphNodeRow, 0, nodeCount) : this.graphNodeRow;
        const edgeOffsets = nodeCount > 0 ? new Int32Array(this.sabPersistGraphEdgeOffsets, 0, nodeCount + 1) : this.graphEdgeOffsets;
        const edgeWrite = nodeCount > 0 ? edgeOffsets[nodeCount] : 0;
        const edgeTargets = new Int16Array(this.sabPersistGraphEdgeTargets, 0, edgeWrite);
        const cellToRegion = size > 0 ? new Int16Array(this.sabCellToRegionIdx, 0, size) : this.graphCellToRegion;
        const edges = [];
        for (let i = 0; i < nodeCount; i++) for (let e = edgeOffsets[i]; e < edgeOffsets[i + 1]; e++) edges.push({ sourceIdx: i, targetIdx: edgeTargets[e] });
        const navSnap = this.getNavSnapshotView();
        const blocked = navSnap?.blocked ?? grid.grid;
        const regionCanStep = navSnap
            ? (fromCol, fromRow, toCol, toRow) => snapshotCanStep(navSnap, fromCol, fromRow, toCol, toRow) || snapshotCanStep(navSnap, toCol, toRow, fromCol, fromRow)
            : (fromCol, fromRow, toCol, toRow) => grid.canStep(fromCol, fromRow, toCol, toRow) || grid.canStep(toCol, toRow, fromCol, fromRow);
        return {
            cols: grid.cols,
            rows: grid.rows,
            minX: grid.minX,
            minY: grid.minY,
            cellSize: grid.cellSize,
            grid: blocked,
            regionCanStep,
            cellToRegion,
            nodeCount,
            nodeCol,
            nodeRow,
            nodeIds: this.graphNodeIds,
            edges,
            gridToWorld(col, row) {
                return grid.gridToWorld(col, row);
            },
        };
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
            this.sabGridFill = new SharedArrayBuffer(size);
            this.sabFloorKind = new SharedArrayBuffer(size);
            this.sabFloorFacing = new SharedArrayBuffer(size);
            this.sabEdgeSlots = new SharedArrayBuffer(size * 4 * 4);
            this.sabOctileNeighbors = new SharedArrayBuffer(size * 8 * 4);
            this.sabHopOffsets = new SharedArrayBuffer((size + 1) * 4);
            this.sabHopExitIdx = new SharedArrayBuffer(Math.max(hopExitLen, 4));
            this.sabHopCost = new SharedArrayBuffer(Math.max(hopCostLen, 4));
            this.sabCardinalOpen = new SharedArrayBuffer(size);
            this.sabVertexPassability = new SharedArrayBuffer(Math.max(vertCount, 4));
            this.navBlocked = new Uint8Array(this.sabBlocked);
            this.navGridFill = new Uint8Array(this.sabGridFill);
            this.navFloorKind = new Uint8Array(this.sabFloorKind);
            this.navFloorFacing = new Uint8Array(this.sabFloorFacing);
            this.navEdgeSlots = new Int32Array(this.sabEdgeSlots);
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
    getNavBlockedSab() {
        return this.sabBlocked;
    }
    navCacheKey() {
        return this._navKey;
    }
    _canIncrementalPatch(grid) {
        const size = grid.cols * grid.rows;
        return this._navSize === size && size > 0 && this._navKey !== "" && this.navBlocked;
    }
    async scheduleNavTopologySyncAwait(grid = this.navGraph) {
        const targetKey = snapshotNavCacheKey(grid);
        while (this._navKey !== targetKey || this._navSyncPromise) {
            this.scheduleNavTopologySync(grid);
            if (this._navSyncPromise) await this._navSyncPromise;
        }
    }
    _navSimPayload(grid = this.navGraph) {
        return {
            sabGridFill: this.sabGridFill,
            sabFloorKind: this.sabFloorKind,
            sabFloorFacing: this.sabFloorFacing,
            sabEdgeSlots: this.sabEdgeSlots,
            edgePool: grid.edgeStore.pool,
            passageEdgeCount: grid.edgeStore.passageEdgeCount,
            portalEdgeCount: grid.edgeStore.portalEdgeCount,
        };
    }
    _hopSabCapacity(grid) {
        return Math.max(grid.edgeStore.portalEdgeCount, 4);
    }
    scheduleNavTopologySync(grid = this.navGraph) {
        const cacheKey = snapshotNavCacheKey(grid);
        if (cacheKey === this._navKey) return;
        if (this._navSyncPromise) {
            this._deferFullNavSync = true;
            return;
        }
        const size = grid.cols * grid.rows;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        this._pendingPatchBounds = null;
        this._lastGridTopologyEpoch = grid.gridTopologyEpoch;
        this._navKey = cacheKey;
        this._navSnapshotView = null;
        this.navGraph.gridNavSnapshot = null;
        const blocked = packBlockedFromGrid(grid);
        const hopCap = this._hopSabCapacity(grid);
        this._ensureNavBuffers(size, hopCap * 4, hopCap, vertCount);
        this.navBlocked.set(blocked);
        packNavSimSabFromGrid(grid, this.navGridFill, this.navFloorKind, this.navFloorFacing, this.navEdgeSlots);
        stampPassageNetworkIdsOnGrid(grid);
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
                ...this._navSimPayload(grid),
            });
        });
    }
    async _ensureFullNavSync(grid = this.navGraph) {
        this._pendingPatchBounds = null;
        if (this._navSyncPromise) await this._navSyncPromise;
        if (snapshotNavCacheKey(grid) !== this._navKey) {
            this.scheduleNavTopologySync(grid);
            if (this._navSyncPromise) await this._navSyncPromise;
        }
    }
    /** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../DataStructures/CellRect.js").CellBounds} bounds */
    async patchNavTopology(grid, bounds) {
        const cacheKey = snapshotNavCacheKey(grid);
        if (cacheKey === this._navKey) return;
        if (isEmptyCellBounds(bounds) || grid.gridTopologyEpoch !== this._lastGridTopologyEpoch || !this._canIncrementalPatch(grid)) {
            await this._ensureFullNavSync(grid);
            return;
        }
        this._pendingPatchBounds = unionCellBounds(this._pendingPatchBounds, bounds);
        if (this._navSyncPromise) await this._navSyncPromise;
        await this._drainNavTopologySync(grid);
    }
    async _drainNavTopologySync(grid) {
        try {
            while (this._pendingPatchBounds) {
                const dataBounds = expandCellBoundsForNavPatch(this._pendingPatchBounds, grid.cols, grid.rows);
                const simBounds = expandCellBoundsForNavPatch(dataBounds, grid.cols, grid.rows, 1);
                const octileBounds = expandCellBoundsForNavPatch(dataBounds, grid.cols, grid.rows, NAV_TOPOLOGY_OCTILE_SHELL);
                this._pendingPatchBounds = null;
                const cacheKey = snapshotNavCacheKey(grid);
                if (cacheKey === this._navKey) continue;
                this._navKey = cacheKey;
                this._lastGridTopologyEpoch = grid.gridTopologyEpoch;
                this._navSnapshotView = null;
                this.navGraph.gridNavSnapshot = null;
                packBlockedIntoRect(grid, dataBounds, this.navBlocked);
                copyNavSimSabRect(grid, simBounds, this.navGridFill, this.navFloorKind, this.navFloorFacing, this.navEdgeSlots);
                const hopCap = this._hopSabCapacity(grid);
                this._ensureNavBuffers(grid.cols * grid.rows, hopCap * 4, hopCap, (grid.cols + 1) * (grid.rows + 1));
                stampPassageNetworkIdsOnGrid(grid);
                this._navSyncPromise = new Promise((resolve) => {
                    this._navSyncResolve = resolve;
                    this.host.worker.postMessage({
                        type: "patchNavSnapshot",
                        cols: grid.cols,
                        rows: grid.rows,
                        dataStartCol: dataBounds.startCol,
                        dataEndCol: dataBounds.endCol,
                        dataStartRow: dataBounds.startRow,
                        dataEndRow: dataBounds.endRow,
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
                        ...this._navSimPayload(grid),
                    });
                });
                await this._navSyncPromise;
            }
        } finally {
            if (this._pendingPatchBounds && snapshotNavCacheKey(grid) !== this._navKey) void this._drainNavTopologySync(grid);
        }
    }
    async _ensureWorkerNavReady() {
        await this.scheduleNavTopologySyncAwait(this.navGraph);
    }
    async _ensureWorkerGraphReady(graphEpoch) {
        await this.awaitGraphReady();
        return this._graphEpoch >= graphEpoch && this.graphNodeCount > 0;
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
    _buildReplanResultPrep(mode, startCol, startRow, targetCol, targetRow) {
        if (mode === "local") return { mode: "local", startCol, startRow, targetCol, targetRow };
        const { nodeCount, nodeIds, nodeCol, nodeRow } = this.getGraphMeta();
        return { mode: "hpa", startCol, startRow, targetCol, targetRow, nodeCount, nodeIds, nodeCol, nodeRow, regionConnectMaxLen: 96 };
    }
    async runOneShotReplan(slot, startCol, startRow, targetCol, targetRow, obstacleGrid, graphEpoch, replanCtx = null) {
        await this._ensureWorkerNavReady();
        if (!(await this._ensureWorkerGraphReady(graphEpoch))) return null;
        if (replanCtx?.onAbstractReady && replanCtx.replanRequestId != null)
            this._replanHooks[slot] = { requestId: replanCtx.replanRequestId, onAbstractReady: replanCtx.onAbstractReady, obstacleGrid, startCol, startRow, targetCol, targetRow };
        try {
            await this._dispatchAndWait(slot, "replan", { startCol, startRow, targetCol, targetRow, localMaxLen: 96, regionConnectMaxLen: 96 });
        } finally {
            this._replanHooks[slot] = null;
        }
        const mode = this._replanSlotMode[slot] ?? "local";
        const prep = this._buildReplanResultPrep(mode, startCol, startRow, targetCol, targetRow);
        const abstractIdx = this._readAbstractIdx(slot);
        const pathLen = this.pathLength(slot);
        const result = buildHpaReplanResult(obstacleGrid, prep, abstractIdx, pathLen);
        if (!result) return null;
        return { complete: true, result };
    }
    /**
     * @param {{
     *   obstacleGrid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid,
     *   startX: number, startY: number, targetX: number, targetY: number,
     *   graphEpoch: number, navState: import("./navSession.js").NavSessionState,
     *   replanRequestId: number,
     *   onAbstractReady?: (result: object) => void,
     * }} opts
     */
    async requestPath(opts) {
        const { obstacleGrid, startX, startY, targetX, targetY, graphEpoch, navState, replanRequestId, onAbstractReady } = opts;
        this.releaseOwnedPathSlot(navState);
        if (!(await this._ensureWorkerGraphReady(graphEpoch))) return null;
        const { startCol, startRow, targetCol, targetRow } = resolveSnappedPathEndpoints(obstacleGrid, startX, startY, targetX, targetY);
        const slot = this.leaseSlot(navState);
        navState.hpaReplanSlot = slot;
        let workerOut = null;
        try {
            workerOut = await this.runOneShotReplan(slot, startCol, startRow, targetCol, targetRow, obstacleGrid, graphEpoch, { replanRequestId, onAbstractReady });
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
