import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
import { expandRegionDamageBounds } from "./hpaRegionGraph.js";
import { createWorkerNavSnapshotView, snapshotCanStep, gridNavFrameKey } from "./GridNavSnapshot.js";
import { gridNavSnapshotCacheKey } from "../Spatial/grid/gridNavEpoch.js";
import { createNavTopologySabArena, growNavTopologyHopSab, growNavTopologyVertexSab, packNavTopologyFromGrid, packBlockedFromGrid } from "./navTopologySab.js";
import {
    createHpaWorkerSabPools,
    growHpaCellToRegionSab,
    hpaPathSlotMeta,
    hpaPathSlotCols,
    hpaPathSlotRows,
    hpaPathSlotAbstractIdx,
    hpaPersistNodeColView,
    hpaPersistNodeRowView,
    hpaPersistEdgeOffsetsView,
    hpaPersistEdgeTargetsView,
} from "./hpaWorkerSab.js";
import { assertMainNavHopSab } from "./navSimHopBake.js";
import { gridSettings } from "../../Config/balance/grid.js";
import { navEdgePoolSabByteLength, packEdgePoolToSab } from "../Spatial/grid/navEdgePoolSab.js";
import { navPassagePolicySabByteLength, packPassagePolicyToSab } from "./navPassagePolicySab.js";
import { buildHpaReplanResult, resolveSnappedPathEndpoints } from "./hpaPathRequest.js";
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
        this._workerGridFrameKey = "";
        this.sabEdgePool = new SharedArrayBuffer(navEdgePoolSabByteLength(4));
        this.navEdgePoolBytes = new Uint8Array(this.sabEdgePool);
        this._edgePoolSabRefs = 0;
        this.sabPassagePolicy = new SharedArrayBuffer(navPassagePolicySabByteLength(0));
        this._passagePolicyKeyCount = 0;
        this._navSyncPromise = null;
        this._navSnapshotView = null;
        this._navArena = null;
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
        this.graphNodeCount = 0;
        Object.assign(
            this,
            createHpaWorkerSabPools({
                maxSlots: MAX_HPA_REPLAN_SLOTS,
                maxPathLen: MAX_HPA_PATH_LEN,
                maxAbstractLen: MAX_HPA_ABSTRACT_LEN,
                maxGraphNodes: MAX_HPA_GRAPH_NODES,
                maxGraphEdges: MAX_GRAPH_EDGES,
            }),
        );
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
        this._slotFree = [];
        for (let i = 0; i < MAX_HPA_REPLAN_SLOTS; i++) this._slotFree.push(i);
        this._slotOwner = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        /** @type {Array<{ requestId: number, onAbstractReady?: (result: object) => void, obstacleGrid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, startCol: number, startRow: number, targetCol: number, targetRow: number } | null>} */
        this._replanHooks = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        /** @type {("local" | "hpa" | null)[]} */
        this._replanSlotMode = new Array(MAX_HPA_REPLAN_SLOTS).fill(null);
        this.host.worker.onmessage = (e) => {
            const { type, slot, requestId } = e.data;
            if (type === SYNC_NAV_DONE) {
                this._navSnapshotView = createWorkerNavSnapshotView(this.navGraph, this._navKey, this.navBlocked, this.navOctileNeighbors, this.navHopOffsets, this.navHopExitIdx, this.navHopCost);
                this.navGraph.gridNavSnapshot = this._navSnapshotView;
                assertMainNavHopSab(this.navGraph, this.navHopOffsets, this._navKey);
                const resolve = this._navSyncResolve;
                this._navSyncResolve = null;
                this._navSyncPromise = null;
                resolve();
                if (this._deferFullNavSync) {
                    this._deferFullNavSync = false;
                    this._navKey = "";
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
                const expectedSize = this.navGraph.cols * this.navGraph.rows;
                if (expectedSize > 0 && this._graphSize !== expectedSize) this._ensureGraphCellBuffers(expectedSize);
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
        this.sabCellToRegionIdx = growHpaCellToRegionSab(this.sabCellToRegionIdx, size);
        this.graphCellToRegion = new Int16Array(this.sabCellToRegionIdx);
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
        const nodeCol = hpaPersistNodeColView(this.sabPersistGraphNodeCol, nodeCount);
        const nodeRow = hpaPersistNodeRowView(this.sabPersistGraphNodeRow, nodeCount);
        const edgeOffsets = hpaPersistEdgeOffsetsView(this.sabPersistGraphEdgeOffsets, nodeCount);
        const edgeWrite = nodeCount > 0 ? edgeOffsets[nodeCount] : 0;
        const edgeTargets = hpaPersistEdgeTargetsView(this.sabPersistGraphEdgeTargets, edgeWrite);
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
        return hpaPathSlotMeta(this.sabPathMetaPool, slot);
    }
    _pathCols(slot) {
        return hpaPathSlotCols(this.sabPathColsPool, slot, MAX_HPA_PATH_LEN);
    }
    _pathRows(slot) {
        return hpaPathSlotRows(this.sabPathRowsPool, slot, MAX_HPA_PATH_LEN);
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
        const refCount = grid.edgeStore.pool.length;
        this._ensureNavEdgePoolSab(refCount);
        this._edgePoolSabRefs = packEdgePoolToSab(grid.edgeStore, this.navEdgePoolBytes);
    }
    _packPassagePolicyForWorker(grid) {
        const keyCount = grid._passagePoweredKeys?.size ?? 0;
        const byteLen = navPassagePolicySabByteLength(keyCount);
        if (this.sabPassagePolicy.byteLength < byteLen) this.sabPassagePolicy = new SharedArrayBuffer(byteLen);
        this._passagePolicyKeyCount = packPassagePolicyToSab(grid._passagePoweredKeys, grid._passageNetworkIdByKey, new Uint8Array(this.sabPassagePolicy));
    }
    _syncNavArenaFields() {
        const arena = this._navArena;
        this.sabBlocked = arena.sabBlocked;
        this.sabGridFill = arena.sabGridFill;
        this.sabFloorKind = arena.sabFloorKind;
        this.sabFloorFacing = arena.sabFloorFacing;
        this.sabEdgeSlots = arena.sabEdgeSlots;
        this.sabOctileNeighbors = arena.sabOctileNeighbors;
        this.sabHopOffsets = arena.sabHopOffsets;
        this.sabHopExitIdx = arena.sabHopExitIdx;
        this.sabHopCost = arena.sabHopCost;
        this.sabCardinalOpen = arena.sabCardinalOpen;
        this.sabVertexPassability = arena.sabVertexPassability;
        this.navBlocked = arena.blocked;
        this.navGridFill = arena.gridFill;
        this.navFloorKind = arena.floorKind;
        this.navFloorFacing = arena.floorFacing;
        this.navEdgeSlots = arena.edgeSlots;
        this.navOctileNeighbors = arena.octileNeighbors;
        this.navHopOffsets = arena.hopOffsets;
        this.navHopExitIdx = arena.hopExitIdx;
        this.navHopCost = arena.hopCost;
        this.navCardinalOpen = arena.cardinalOpen;
        this.navVertexPassability = arena.vertexPassability;
    }
    _ensureNavBuffers(size, hopSlotCap, vertCount, edgePoolRefs = 4) {
        this._ensureNavEdgePoolSab(edgePoolRefs);
        if (this._navSize !== size) {
            this._navSize = size;
            this._navArena = createNavTopologySabArena(size, vertCount, hopSlotCap);
        } else {
            growNavTopologyHopSab(this._navArena, hopSlotCap);
            growNavTopologyVertexSab(this._navArena, vertCount);
        }
        this._syncNavArenaFields();
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
    async scheduleNavTopologySyncAwait(grid = this.navGraph) {
        const targetKey = gridNavSnapshotCacheKey(grid);
        while (this._navKey !== targetKey || this._navSyncPromise) {
            this.scheduleNavTopologySync(grid);
            if (this._navSyncPromise) await this._navSyncPromise;
        }
    }
    _navSimPayload(grid = this.navGraph) {
        const gridFrameKey = gridNavFrameKey(grid);
        const payload = {
            gridFrameKey,
            sabEdgePool: this.sabEdgePool,
            edgePoolCount: this._edgePoolSabRefs,
            sabPassagePolicy: this.sabPassagePolicy,
            passagePolicyKeyCount: this._passagePolicyKeyCount,
            sabGridFill: this.sabGridFill,
            sabFloorKind: this.sabFloorKind,
            sabFloorFacing: this.sabFloorFacing,
            sabEdgeSlots: this.sabEdgeSlots,
            passageEdgeCount: grid.edgeStore.passageEdgeCount,
            portalEdgeCount: grid.edgeStore.portalEdgeCount,
        };
        if (gridFrameKey !== this._workerGridFrameKey) {
            this._workerGridFrameKey = gridFrameKey;
            payload.minX = grid.minX;
            payload.minY = grid.minY;
            payload.cellSize = grid.cellSize;
        }
        return payload;
    }
    scheduleNavTopologySync(grid = this.navGraph) {
        const cacheKey = gridNavSnapshotCacheKey(grid);
        if (cacheKey === this._navKey) return;
        if (this._navSyncPromise) {
            this._deferFullNavSync = true;
            this._navKey = "";
            return;
        }
        const size = grid.cols * grid.rows;
        const vertCount = (grid.cols + 1) * (grid.rows + 1);
        this._navKey = cacheKey;
        this._navSnapshotView = null;
        this.navGraph.gridNavSnapshot = null;
        const hopCap = Math.max(grid.edgeStore.portalEdgeCount, 4);
        const edgePoolRefs = Math.max(grid.edgeStore.pool.length, 4);
        this._ensureNavBuffers(size, hopCap, vertCount, edgePoolRefs);
        this.navBlocked.set(packBlockedFromGrid(grid));
        packNavTopologyFromGrid(grid, this._navArena);
        this._packNavEdgePoolForWorker(grid);
        this._packPassagePolicyForWorker(grid);
        this._navSyncPromise = new Promise((resolve) => {
            this._navSyncResolve = resolve;
            this.host.worker.postMessage({
                type: "buildNavSnapshot",
                navCacheKey: cacheKey,
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
        const nodeCount = this.graphNodeCount;
        return {
            nodeCount,
            nodeIds: this.graphNodeIds,
            nodeCol: hpaPersistNodeColView(this.sabPersistGraphNodeCol, nodeCount),
            nodeRow: hpaPersistNodeRowView(this.sabPersistGraphNodeRow, nodeCount),
            idToIdx: this.graphIdToIdx,
        };
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
        await this.scheduleNavTopologySyncAwait(obstacleGrid);
        const navKey = gridNavSnapshotCacheKey(obstacleGrid);
        if (obstacleGrid.gridNavSnapshot?.cacheKey !== navKey) return null;
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
