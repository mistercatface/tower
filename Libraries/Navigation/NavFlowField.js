import { IdxMinHeap } from "../DataStructures/MinHeap.js";
import { PathfindingWorkerClient } from "./PathfindingWorkerClient.js";
import { CARDINAL_DCOL, CARDINAL_DR, OCTILE_DCOL, OCTILE_DR, OCTILE_STEP_COST, OCTILE_DIR_COUNT, circleIntersectsAabb, createAabb } from "../Math/math.js";
import { manhattanDistanceIdx, octileDistanceIdx, makeAdjacencyKey, boundaryBlocksStepFrom, recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto, isNavTopologyReady, CELL_EDGE_SLOT_BYTES, cellEdgeSlotOffset, cellInRect, diagonalStepOpen, getCardinalBit, edgeNeighborIdx, hasLineOfSight, worldColAtOrigin, worldRowAtOrigin, cellBoundsForGrid, forEachDenseCellInBounds, padCellIdxToGrid, padCellBoundsInPlace, forEachDenseCellInRect, gridNavCacheKey, centeredGridFrameKey, createCenteredGridFrame, getCellBoundsInCenteredFrameInto, gridCenterXInCenteredFrame, gridCenterYInCenteredFrame, setCenteredGridFrameCenter, worldColInCenteredFrame, worldRowInCenteredFrame, isEmptyCellBounds, unionCellBounds, isIdxInMapGenBounds, stampLayoutFromConfig, forEachStampGlobalIdx, gridCellLayout, corridorPathHitsOccupied } from "../Spatial/spatial.js";
import { FloorBelt } from "../Spatial/belts.js";
import { PortalLink } from "../Spatial/portals.js";
import { MAX_HPA_REPLAN_SLOTS } from "./HpaPathWorker.js";
import { resolveBodyRadius, physicsSettings, getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward, clearGroundRollDrive, decelerateRoll } from "../Physics/physics.js";
import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "./NavCore.js";
import { NavRuntime } from "./NavCore.js";
import { snapshotWorldToIdx } from "./NavCore.js";
import { MAX_CACHE, FLOW_DONE, FLOW_WINDOW_DONE, FLOW_DECODE_X, FLOW_DECODE_Y } from "./NavCore.js";
export class FlowFieldGrid {
    constructor(cellSize, width, height, navGraph, workerUrl, hpaPathWorker = null) {
        this.window = new FlowFieldWindow(cellSize, width, height);
        this.frame = this.window.frame;
        this.cellSize = this.window.cellSize;
        this.width = this.window.width;
        this.height = this.window.height;
        this.navGraph = navGraph;
        this.hpaPathWorker = hpaPathWorker;
        this.cols = this.window.cols;
        this.rows = this.window.rows;
        const size = this.cols * this.rows;
        this.sabFlowToNav = new SharedArrayBuffer(size * 4);
        this.flowToNavIdx = new Int32Array(this.sabFlowToNav).fill(-1);
        this.navCols = 0;
        this.navRows = 0;
        this.neighborLayout = OCTILE_NEIGHBOR_GRID_LAYOUT;
        this.sabNeighbors = new SharedArrayBuffer(this.neighborLayout.bufferByteLength(size));
        this.neighborGrid = new Int32Array(this.sabNeighbors).fill(-1);
        this.sabFlowPool = new SharedArrayBuffer(size * MAX_CACHE);
        this.sabFlowDistPool = new SharedArrayBuffer(size * MAX_CACHE * 4);
        this.flowDistPool = new Int32Array(this.sabFlowDistPool);
        this.cache = new FlowCacheManager(MAX_CACHE, this.window);
        this._flowStepsResult = { slot: null, steps: null, ready: false };
        this._topologyKey = "";
        this._windowReady = false;
        this._flowNavBound = false;
        this._flowNavBoundSize = 0;
        this._navBlockedView = null;
        if (!workerUrl) throw new Error("FlowFieldGrid requires an injected workerUrl");
        this.protocol = new PathfindingWorkerClient(workerUrl, MAX_CACHE, "FlowFieldGrid", (data) => this._handleWorkerMessage(data));
        this._workerHost = this.protocol.host;
        this.protocol.postMessage({ type: "init", data: { GRID_WIDTH: this.cols, GRID_SIZE: size, sabFlowToNav: this.sabFlowToNav, sabNeighbors: this.sabNeighbors, sabFlowPool: this.sabFlowPool, sabFlowDistPool: this.sabFlowDistPool } });
        this._syncWindowAliases();
    }
    _syncWindowAliases() {
        this.frame = this.window.frame;
        this.cellSize = this.window.cellSize;
        this.width = this.window.width;
        this.height = this.window.height;
        this.cols = this.window.cols;
        this.rows = this.window.rows;
        this.offsetX = this.frame.offsetX;
        this.offsetY = this.frame.offsetY;
        this.centerX = this.frame.centerX;
        this.centerY = this.frame.centerY;
        this.navCols = this.window.navCols;
        this.navRows = this.window.navRows;
        this._topologyKey = this.window.topologyKey;
        this._windowReady = this.window.ready;
        this.cellBounds = this.window.cellBounds;
        this.cache?.resize(this.cols, this.rows);
    }
    _handleWorkerMessage(data) {
        if (data.type === FLOW_DONE) {
            this.protocol.markReady(data.slot, data.requestId);
            return;
        }
        if (data.type === FLOW_WINDOW_DONE) this._onFlowWindowDone();
    }
    _setCenter(centerX, centerY) {
        const snappedX = Math.round((centerX - this.offsetX) / this.cellSize) * this.cellSize + this.offsetX;
        const snappedY = Math.round((centerY - this.offsetY) / this.cellSize) * this.cellSize + this.offsetY;
        this.window.setCenter(snappedX, snappedY);
        this._syncWindowAliases();
    }
    invalidateLocalTopology() {
        this.window.invalidateTopology();
        this._syncWindowAliases();
    }
    invalidateFlowSlots() {
        this.cache.invalidate(this.protocol);
    }
    _onFlowWindowDone() {
        this.window.markReady();
        this._syncWindowAliases();
        this.invalidateFlowSlots();
        this._windowSyncResolve?.();
        this._windowSyncResolve = null;
        this._windowSyncPromise = null;
    }
    _bindFlowNavArena(navFrame) {
        const navSize = navFrame.cols * navFrame.rows;
        const rebind = !this._flowNavBound || this._flowNavBoundSize !== navSize;
        if (rebind) {
            const sabBlocked = this.hpaPathWorker.getNavBlockedSab();
            const sabOctilePredecessors = this.hpaPathWorker.getNavOctilePredecessorsSab();
            const sabActivePortalPairs = this.hpaPathWorker.sabActivePortalPairs;
            const sabActivePortalCount = this.hpaPathWorker.sabActivePortalCount;
            this.protocol.postMessage({ type: "bindFlowNavArena", data: { sabBlocked, sabOctilePredecessors, sabActivePortalPairs, sabActivePortalCount, navCols: navFrame.cols, navRows: navFrame.rows } });
            this._navBlockedView = new Uint8Array(sabBlocked);
            this._flowNavBound = true;
            this._flowNavBoundSize = navSize;
        }
    }
    _postFlowWindowSync() {
        this.window.ready = false;
        this._syncWindowAliases();
        this._windowSyncGen = (this._windowSyncGen ?? 0) + 1;
        const gen = this._windowSyncGen;
        this._windowSyncPromise = new Promise((resolve) => {
            this._windowSyncResolve = () => {
                if (this._windowSyncGen === gen) resolve();
            };
        });
        this.protocol.postMessage({ type: "syncFlowWindow" });
    }
    rebuildFlowToNavMap(navFrame) {
        this.window.rebuildFlowToNavMap(this.flowToNavIdx, navFrame);
        this._syncWindowAliases();
    }
    isFlowCellBlocked(flowIdx) {
        return this.window.isFlowCellBlocked(this.flowToNavIdx, this._navBlockedView, flowIdx);
    }
    ensureLocalTopology(navCacheKey, navFrame) {
        if (!this.window.beginTopologySync(navCacheKey)) return false;
        this._syncWindowAliases();
        this.rebuildFlowToNavMap(navFrame);
        this._bindFlowNavArena(navFrame);
        this._postFlowWindowSync();
        return true;
    }
    invalidateNavTopology() {
        this.invalidateLocalTopology();
        this.invalidateFlowSlots();
        this._flowNavBound = false;
        this._flowNavBoundSize = 0;
        this._navBlockedView = null;
    }
    /** Nav topology must already be synced via NavRuntime — never schedules worker nav here. */
    syncLocalTopology() {
        const cacheKey = gridNavCacheKey(this.navGraph);
        const navFrame = this.hpaPathWorker?.getGridFrame();
        if (!navFrame || !isNavTopologyReady(this.hpaPathWorker, this.navGraph)) return false;
        return this.ensureLocalTopology(cacheKey, navFrame);
    }
    refresh() {
        this.invalidateNavTopology();
    }
    shiftCenter(newCenterX, newCenterY) {
        this._setCenter(newCenterX, newCenterY);
        this.invalidateLocalTopology();
        this.syncLocalTopology();
    }
    ensureRollTargetWindow(propX, propY, targetX, targetY, recenterThreshold) {
        const focusX = (propX + targetX) * 0.5;
        const focusY = (propY + targetY) * 0.5;
        const needsRecenter = !this.containsWorldPoint(propX, propY) || !this.containsWorldPoint(targetX, targetY) || Math.max(Math.abs(focusX - this.centerX), Math.abs(focusY - this.centerY)) > recenterThreshold;
        if (needsRecenter) {
            this._setCenter(focusX, focusY);
            this.invalidateLocalTopology();
        }
        this.syncLocalTopology();
    }
    isFlowSlotReady(slot) {
        return this.protocol.isReady(slot);
    }
    flowFieldView(slot) {
        const size = this.cols * this.rows;
        return new Uint8Array(this.sabFlowPool, slot * size, size);
    }
    readFlowStepsAt(slot, worldX, worldY) {
        const idx = this.window.worldToIdx(worldX, worldY);
        if (idx < 0) return null;
        return this.readFlowStepsAtIdx(slot, idx);
    }
    readFlowStepsAtIdx(slot, idx) {
        if (idx < 0 || idx >= this.cols * this.rows) return null;
        const dist = this.flowDistPool[slot * this.cols * this.rows + idx];
        return dist >= 0 ? dist : null;
    }
    readFlowStepsForTargetInto(out, agentX, agentY, targetX, targetY, range = 999999) {
        out.slot = null;
        out.steps = null;
        out.ready = false;
        this.syncLocalTopology();
        if (!this.window.ready) return out;
        const slot = this.ensureFlowRequest(targetX, targetY, range);
        out.slot = slot;
        if (slot === null || !this.isFlowSlotReady(slot)) return out;
        out.steps = this.readFlowStepsAt(slot, agentX, agentY);
        out.ready = true;
        return out;
    }
    readFlowStepsForTarget(agentX, agentY, targetX, targetY, range = 999999) {
        return this.readFlowStepsForTargetInto(this._flowStepsResult, agentX, agentY, targetX, targetY, range);
    }
    ensureFlowRequest(targetX, targetY, range = 999999) {
        return this.cache.getOrRequestSlot(targetX, targetY, range, this.protocol);
    }
    getReadyFlowField(targetX, targetY, range = 999999) {
        this.syncLocalTopology();
        if (!this.window.ready) return null;
        const slot = this.ensureFlowRequest(targetX, targetY, range);
        if (slot === null || !this.isFlowSlotReady(slot)) return null;
        return this.flowFieldView(slot);
    }
    clear() {
        this.flowToNavIdx.fill(-1);
        this.neighborGrid.fill(-1);
        this.invalidateNavTopology();
        this.invalidateFlowSlots();
    }
    worldToIdx(x, y) {
        return this.window.worldToIdx(x, y);
    }
    containsWorldPoint(x, y) {
        return this.window.containsWorldPoint(x, y);
    }
    gridCenterXByIdx(idx) {
        return this.window.gridCenterXByIdx(idx);
    }
    gridCenterYByIdx(idx) {
        return this.window.gridCenterYByIdx(idx);
    }
    getCellBoundsByIdx(idx) {
        return this.window.getCellBoundsByIdx(idx);
    }
    entityIntersectsCellIdx(x, y, radius, idx) {
        return this.window.entityIntersectsCellIdx(x, y, radius, idx);
    }
    flowReachCacheToken() {
        return this.window.topologyKey;
    }
}
export class FlowCacheManager {
    constructor(maxCacheSize, flowWindow) {
        this.maxCacheSize = maxCacheSize;
        this.window = flowWindow;
        this.cacheLookup = new Int32Array(flowWindow.cols * flowWindow.rows).fill(-1);
        this.slotToTargetIdx = new Int32Array(maxCacheSize).fill(-1);
        this.slotToRange = new Int32Array(maxCacheSize).fill(-1);
        this.nextSlotForTarget = new Int32Array(maxCacheSize).fill(-1);
        this.lruList = [];
        this.allocatedCount = 0;
    }
    resize(cols, rows) {
        const size = cols * rows;
        if (this.cacheLookup.length !== size) this.cacheLookup = new Int32Array(size).fill(-1);
        else this.cacheLookup.fill(-1);
        this.slotToTargetIdx.fill(-1);
        this.slotToRange.fill(-1);
        this.nextSlotForTarget.fill(-1);
        this.lruList.length = 0;
        this.allocatedCount = 0;
    }
    invalidate(protocol) {
        this.cacheLookup.fill(-1);
        this.slotToTargetIdx.fill(-1);
        this.slotToRange.fill(-1);
        this.nextSlotForTarget.fill(-1);
        this.lruList.length = 0;
        this.allocatedCount = 0;
        protocol?.invalidateSlots();
    }
    findSlot(targetIdx, range) {
        let slot = this.cacheLookup[targetIdx];
        while (slot !== -1) {
            if (this.slotToRange[slot] === range) return slot;
            slot = this.nextSlotForTarget[slot];
        }
        return -1;
    }
    unlinkSlotFromTarget(slot, targetIdx) {
        let current = this.cacheLookup[targetIdx];
        if (current === slot) {
            this.cacheLookup[targetIdx] = this.nextSlotForTarget[slot];
            this.nextSlotForTarget[slot] = -1;
            return;
        }
        while (current !== -1) {
            const next = this.nextSlotForTarget[current];
            if (next === slot) {
                this.nextSlotForTarget[current] = this.nextSlotForTarget[slot];
                this.nextSlotForTarget[slot] = -1;
                return;
            }
            current = next;
        }
    }
    allocateSlot(targetIdx, range) {
        let slot;
        if (this.allocatedCount < this.maxCacheSize) slot = this.allocatedCount++;
        else {
            slot = this.lruList.shift();
            const oldTargetIdx = this.slotToTargetIdx[slot];
            if (oldTargetIdx !== -1) this.unlinkSlotFromTarget(slot, oldTargetIdx);
        }
        this.slotToTargetIdx[slot] = targetIdx;
        this.slotToRange[slot] = range;
        this.nextSlotForTarget[slot] = this.cacheLookup[targetIdx];
        this.cacheLookup[targetIdx] = slot;
        this.lruList.push(slot);
        return slot;
    }
    markUsed(slot) {
        const idx = this.lruList.indexOf(slot);
        if (idx !== -1) {
            this.lruList.splice(idx, 1);
            this.lruList.push(slot);
        }
    }
    getOrRequestSlot(targetX, targetY, range, protocol) {
        if (!this.window.ready) return null;
        const targetIdx = this.window.worldToIdx(targetX, targetY);
        if (targetIdx < 0) return null;
        const normalizedRange = Number.isFinite(range) ? range | 0 : 999999;
        let slot = this.findSlot(targetIdx, normalizedRange);
        if (slot === -1) {
            slot = this.allocateSlot(targetIdx, normalizedRange);
            const tx = targetIdx % this.window.cols;
            const ty = (targetIdx / this.window.cols) | 0;
            protocol.postSlot(slot, { type: "updateFlow", tx, ty, range: normalizedRange });
        } else this.markUsed(slot);
        return slot;
    }
}
export function computeFlowField(vectorMap, { gridWidth, gridSize, flowToNavIdx, navBlocked, neighborGrid, neighborLayout = OCTILE_NEIGHBOR_GRID_LAYOUT, tx, ty, range, bfsDistances, bfsQueue, localVectorMap, distancesOut, activePortalPairs = null, activePortalCount = null }) {
    bfsDistances.fill(-1);
    localVectorMap.fill(255);
    const startIdx = tx + ty * gridWidth;
    const isBlocked = (idx) => flowCellBlocked(flowToNavIdx, navBlocked, idx);
    let navToFlow = null;
    const portalCount = activePortalCount ? activePortalCount[0] : 0;
    if (activePortalPairs && portalCount > 0) {
        let maxNavIdx = -1;
        for (let i = 0; i < gridSize; i++) if (flowToNavIdx[i] > maxNavIdx) maxNavIdx = flowToNavIdx[i];
        if (maxNavIdx >= 0) {
            navToFlow = new Int32Array(maxNavIdx + 1).fill(-1);
            for (let i = 0; i < gridSize; i++) {
                const navIdx = flowToNavIdx[i];
                if (navIdx >= 0) navToFlow[navIdx] = i;
            }
        }
    }
    if (startIdx >= 0 && startIdx < gridSize && !isBlocked(startIdx)) {
        localVectorMap[startIdx] = 4;
        let head = 0;
        let tail = 0;
        bfsDistances[startIdx] = 0;
        bfsQueue[tail++] = startIdx;
        while (head < tail) {
            const idx = bfsQueue[head++];
            const currentDist = bfsDistances[idx];
            if (currentDist >= range) continue;
            for (let i = 0; i < neighborLayout.directionCount; i++) {
                const nIdx = neighborGrid[neighborLayout.cellOffset(idx, i)];
                if (nIdx !== -1 && bfsDistances[nIdx] === -1 && !isBlocked(nIdx)) {
                    const dc = OCTILE_DCOL[i];
                    const dr = OCTILE_DR[i];
                    bfsDistances[nIdx] = currentDist + 1;
                    bfsQueue[tail++] = nIdx;
                    localVectorMap[nIdx] = -dc + 1 + (-dr + 1) * 3;
                }
            }
            if (navToFlow) {
                const currNavIdx = flowToNavIdx[idx];
                if (currNavIdx >= 0)
                    for (let i = 0; i < portalCount; i++) {
                        const exitIdx = activePortalPairs[i * 2];
                        const entryIdx = activePortalPairs[i * 2 + 1];
                        if (currNavIdx === entryIdx)
                            if (exitIdx < navToFlow.length) {
                                const exitFlowIdx = navToFlow[exitIdx];
                                if (exitFlowIdx !== -1 && bfsDistances[exitFlowIdx] === -1 && !isBlocked(exitFlowIdx)) {
                                    bfsDistances[exitFlowIdx] = currentDist + 1;
                                    bfsQueue[tail++] = exitFlowIdx;
                                    localVectorMap[exitFlowIdx] = 4;
                                }
                            }
                    }
            }
        }
    }
    vectorMap.set(localVectorMap);
    if (distancesOut) distancesOut.set(bfsDistances);
}
export class FlowFieldWindow {
    constructor(cellSize, width, height) {
        this.frame = createCenteredGridFrame(cellSize, width, height);
        this.cellSize = this.frame.cellSize;
        this.width = this.frame.width;
        this.height = this.frame.height;
        this.cols = this.frame.cols;
        this.rows = this.frame.rows;
        this.navCols = 0;
        this.navRows = 0;
        this.topologyKey = "";
        this.ready = false;
        this.syncPending = false;
        this.cellBounds = createAabb();
    }
    setCenter(centerX, centerY) {
        setCenteredGridFrameCenter(this.frame, centerX, centerY);
        return this;
    }
    invalidateTopology() {
        this.topologyKey = "";
        this.ready = false;
        this.syncPending = false;
    }
    beginTopologySync(navCacheKey) {
        const key = `${navCacheKey}:${centeredGridFrameKey(this.frame)}`;
        if (key === this.topologyKey && (this.ready || this.syncPending)) return false;
        this.topologyKey = key;
        this.ready = false;
        this.syncPending = true;
        return true;
    }
    markReady() {
        this.ready = true;
        this.syncPending = false;
    }
    rebuildFlowToNavMap(flowToNavIdx, navFrame) {
        const mapped = rebuildFlowToNavIdx(flowToNavIdx, this.frame, navFrame);
        this.navCols = mapped.navCols;
        this.navRows = mapped.navRows;
        return mapped;
    }
    isFlowCellBlocked(flowToNavIdx, navBlockedView, flowIdx) {
        return flowCellBlocked(flowToNavIdx, navBlockedView, flowIdx);
    }
    worldCol(x) {
        return worldColInCenteredFrame(this.frame, x);
    }
    worldRow(y) {
        return worldRowInCenteredFrame(this.frame, y);
    }
    gridCenterX(col) {
        return gridCenterXInCenteredFrame(this.frame, col);
    }
    gridCenterY(row) {
        return gridCenterYInCenteredFrame(this.frame, row);
    }
    gridCenterXByIdx(idx) {
        return this.gridCenterX(idx % this.cols);
    }
    gridCenterYByIdx(idx) {
        return this.gridCenterY((idx / this.cols) | 0);
    }
    worldToIdx(x, y) {
        const col = this.worldCol(x);
        const row = this.worldRow(y);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return row * this.cols + col;
    }
    containsIdx(idx) {
        return idx >= 0 && idx < this.cols * this.rows;
    }
    containsWorldPoint(x, y) {
        return this.worldToIdx(x, y) >= 0;
    }
    getCellBoundsByIdx(idx) {
        return getCellBoundsInCenteredFrameInto(this.cellBounds, this.frame, idx);
    }
    entityIntersectsCellIdx(x, y, radius, idx) {
        return circleIntersectsAabb(x, y, radius, this.getCellBoundsByIdx(idx));
    }
    flowRequest(targetX, targetY, range = 999999) {
        return FlowFieldRequest.fromWorld(this, targetX, targetY, range);
    }
}
export class FlowFieldRequest {
    constructor(targetIdx, range, cols) {
        this.targetIdx = targetIdx;
        this.range = range;
        this.cols = cols;
    }
    static fromWorld(flowWindow, targetX, targetY, range = 999999) {
        const targetIdx = flowWindow.worldToIdx(targetX, targetY);
        if (targetIdx < 0) return null;
        return new FlowFieldRequest(targetIdx, range, flowWindow.cols);
    }
    toWorkerPayload() {
        const tx = this.targetIdx % this.cols;
        const ty = (this.targetIdx / this.cols) | 0;
        return { type: "updateFlow", tx, ty, range: this.range };
    }
}
export function rebuildFlowToNavIdx(flowToNavIdx, flowFrame, navFrame) {
    const flowSize = flowToNavIdx.length;
    const navCols = navFrame.cols;
    const navRows = navFrame.rows;
    const half = flowFrame.cellSize / 2;
    const wxBase = flowFrame.centerX - flowFrame.offsetX + half;
    const wyBase = flowFrame.centerY - flowFrame.offsetY + half;
    const cols = flowFrame.cols;
    const rows = (flowSize / cols) | 0;
    let idx = 0;
    for (let row = 0; row < rows; row++) {
        const worldY = row * flowFrame.cellSize + wyBase;
        for (let col = 0; col < cols; col++) {
            const worldX = col * flowFrame.cellSize + wxBase;
            flowToNavIdx[idx] = snapshotWorldToIdx(navFrame, worldX, worldY);
            idx++;
        }
    }
    return { navCols, navRows };
}
export function rebuildFlowNeighborGrid(flowToNavIdx, octilePredecessors, neighborGrid, flowSize, navCols, navRows, layout = OCTILE_NEIGHBOR_GRID_LAYOUT) {
    const navToFlow = new Int32Array(navCols * navRows).fill(-1);
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        if (navIdx >= 0) navToFlow[navIdx] = idx;
    }
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        if (navIdx < 0) {
            layout.clearCell(neighborGrid, idx);
            continue;
        }
        for (let i = 0; i < layout.directionCount; i++) {
            const navPredIdx = octilePredecessors[layout.cellOffset(navIdx, i)];
            neighborGrid[layout.cellOffset(idx, i)] = navPredIdx >= 0 ? navToFlow[navPredIdx] : -1;
        }
    }
}
export function flowCellBlocked(flowToNavIdx, navBlocked, flowIdx) {
    const navIdx = flowToNavIdx[flowIdx];
    return navIdx < 0 || navBlocked[navIdx] !== 0;
}
export function sampleFlowDirectionInto(out, x, y, flowField, frame) {
    if (!flowField) return null;
    const { cellSize, cols, rows, centerX, centerY, offsetX, offsetY } = frame;
    const halfCell = cellSize / 2;
    const gx = (x - (centerX - offsetX + halfCell)) / cellSize;
    const gy = (y - (centerY - offsetY + halfCell)) / cellSize;
    const col0 = Math.floor(gx);
    const row0 = Math.floor(gy);
    const col1 = col0 + 1;
    const row1 = row0 + 1;
    const tx = gx - col0;
    const ty = gy - row0;
    const c0_valid = col0 >= 0 && col0 < cols;
    const c1_valid = col1 >= 0 && col1 < cols;
    const r0_valid = row0 >= 0 && row0 < rows;
    const r1_valid = row1 >= 0 && row1 < rows;
    let flowX = 0;
    let flowY = 0;
    let totalWeight = 0;
    if (c0_valid && r0_valid) {
        const idx = row0 * cols + col0;
        const val = flowField[idx];
        if (val !== 255) {
            const w = (1 - tx) * (1 - ty);
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (c1_valid && r0_valid) {
        const idx = row0 * cols + col1;
        const val = flowField[idx];
        if (val !== 255) {
            const w = tx * (1 - ty);
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (c0_valid && r1_valid) {
        const idx = row1 * cols + col0;
        const val = flowField[idx];
        if (val !== 255) {
            const w = (1 - tx) * ty;
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (c1_valid && r1_valid) {
        const idx = row1 * cols + col1;
        const val = flowField[idx];
        if (val !== 255) {
            const w = tx * ty;
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (totalWeight <= 0) return null;
    const len = Math.sqrt(flowX * flowX + flowY * flowY);
    if (len <= 0) return null;
    out.x = flowX / len;
    out.y = flowY / len;
    return out;
}
export function sampleFlowDirection(x, y, flowField, frame) {
    return sampleFlowDirectionInto({ x: 0, y: 0 }, x, y, flowField, frame);
}
