import { FlatGraphView } from "../Navigation/navigation.js";
export const HPA_PATH_META_FIELDS = 2;
export const HPA_PATH_META_STRIDE_BYTES = HPA_PATH_META_FIELDS * 4;
/** @param {SharedArrayBuffer} sabPathMetaPool @param {number} slot */
export function hpaPathSlotMeta(sabPathMetaPool, slot) {
    return new Int32Array(sabPathMetaPool, slot * HPA_PATH_META_STRIDE_BYTES, HPA_PATH_META_FIELDS);
}
/** @param {SharedArrayBuffer} sabPathIdxPool @param {number} slot @param {number} maxPathLen */
export function hpaPathSlotIdx(sabPathIdxPool, slot, maxPathLen) {
    return new Int32Array(sabPathIdxPool, slot * maxPathLen * 4, maxPathLen);
}
/** @param {SharedArrayBuffer} sabAbstractIdxPool @param {number} slot @param {number} maxAbstractLen */
export function hpaPathSlotAbstractIdx(sabAbstractIdxPool, slot, maxAbstractLen) {
    return new Int16Array(sabAbstractIdxPool, slot * maxAbstractLen * 2, maxAbstractLen);
}
export function stitchAbstractCellPath(abstractIdx, prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, outIdx, maxPathLen) {
    if (!abstractIdx || !abstractIdx.length) return 0;
    let offset = 0;
    const lastLeg = abstractIdx.length - 1;
    const { nodeCount } = prep;
    for (let i = 0; i < lastLeg; i++) {
        const aIdx = abstractIdx[i];
        const bIdx = abstractIdx[i + 1];
        const legKey = (aIdx << 16) | bIdx;
        let legOffset = tempLegsOffsets.get(legKey);
        let legLen = 0;
        let isTempLeg = true;
        if (legOffset !== undefined) legLen = tempLegsLengths.get(legKey);
        else if (aIdx < nodeCount && bIdx < nodeCount) {
            legLen = resolveRegionLeg(aIdx, bIdx);
            isTempLeg = false;
        }
        if (legLen === 0) return 0;
        const start = offset === 0 ? 0 : 1;
        if (isTempLeg)
            for (let j = start; j < legLen; j++) {
                if (offset >= maxPathLen) return 0;
                outIdx[offset++] = tempLegsBuffer[legOffset + j];
            }
        else
            for (let j = start; j < legLen; j++) {
                if (offset >= maxPathLen) return 0;
                outIdx[offset++] = resolveRegionLeg.scratch[j];
            }
    }
    return offset;
}
/**
 * @param {object} config
 * @param {number} config.maxSlots
 * @param {number} config.maxPathLen
 * @param {number} config.maxAbstractLen
 * @param {number} config.maxGraphNodes
 * @param {number} config.maxGraphEdges
 */
export function createHpaWorkerSabPools({ maxSlots, maxPathLen, maxAbstractLen, maxGraphNodes, maxGraphEdges }) {
    return { sabPathMetaPool: new SharedArrayBuffer(maxSlots * HPA_PATH_META_STRIDE_BYTES), sabPathIdxPool: new SharedArrayBuffer(maxSlots * maxPathLen * 4), sabAbstractIdxPool: new SharedArrayBuffer(maxSlots * maxAbstractLen * 2), sabPersistGraphNodeIdx: new SharedArrayBuffer(maxGraphNodes * 4), sabPersistGraphEdgeOffsets: new SharedArrayBuffer((maxGraphNodes + 1) * 4), sabPersistGraphEdgeTargets: new SharedArrayBuffer(maxGraphEdges * 2), sabPersistGraphEdgeCosts: new SharedArrayBuffer(maxGraphEdges * 2), sabPersistGraphEdgeSources: new SharedArrayBuffer(maxGraphEdges * 2), sabCellToRegionIdx: new SharedArrayBuffer(4), maxPathLen };
}
/** @param {SharedArrayBuffer} sabPathIdxPool @param {number} maxSlots @param {number} maxPathLen */
export function growHpaPathIdxSab(sabPathIdxPool, maxSlots, maxPathLen) {
    const byteLen = Math.max(maxSlots * maxPathLen * 4, 4);
    if (sabPathIdxPool.byteLength >= byteLen) return sabPathIdxPool;
    return new SharedArrayBuffer(byteLen);
}
/** @param {number} cellCount */
export function growHpaCellToRegionSab(sabCellToRegionIdx, cellCount) {
    const byteLen = Math.max(cellCount * 2, 4);
    if (sabCellToRegionIdx.byteLength >= byteLen) return sabCellToRegionIdx;
    return new SharedArrayBuffer(byteLen);
}
export class PersistedHpaGraphWriter {
    constructor(buffers) {
        this.buffers = buffers;
        this.nodeCount = 0;
        this.edgeWrite = 0;
        /** @type {string[]} */
        this.nodeIds = [];
        this.cols = 0;
    }
    get sabNodeIdx() {
        return this.buffers.sabPersistGraphNodeIdx;
    }
    get sabEdgeOffsets() {
        return this.buffers.sabPersistGraphEdgeOffsets;
    }
    get sabEdgeSources() {
        return this.buffers.sabPersistGraphEdgeSources;
    }
    get sabEdgeTargets() {
        return this.buffers.sabPersistGraphEdgeTargets;
    }
    get sabEdgeCosts() {
        return this.buffers.sabPersistGraphEdgeCosts;
    }
    get sabCellToRegion() {
        return this.buffers.sabCellToRegionIdx;
    }
    get maxGraphNodes() {
        return this.buffers.maxGraphNodes;
    }
    get maxGraphEdges() {
        return this.buffers.maxGraphEdges;
    }
    nodeIdxView(length = this.maxGraphNodes) {
        return new Int32Array(this.sabNodeIdx, 0, length);
    }
    edgeOffsetsView(length = this.maxGraphNodes) {
        return new Int32Array(this.sabEdgeOffsets, 0, length + 1);
    }
    edgeSourcesView(length = this.maxGraphEdges) {
        return new Int16Array(this.sabEdgeSources, 0, length);
    }
    edgeTargetsView(length = this.maxGraphEdges) {
        return new Int16Array(this.sabEdgeTargets, 0, length);
    }
    edgeCostsView(length = this.maxGraphEdges) {
        return new Uint16Array(this.sabEdgeCosts, 0, length);
    }
    cellToRegionView(cellCount) {
        return new Int16Array(this.sabCellToRegion, 0, cellCount);
    }
    writePackedRegionGraph(packed, frame) {
        this.assertCapacity(packed, frame);
        this.cols = frame.cols;
        this.nodeIdxView().set(packed.nodeIdx);
        this.edgeSourcesView().set(packed.edgeSources);
        this.edgeTargetsView().set(packed.edgeTargets);
        this.edgeCostsView().set(packed.edgeCosts);
        this.cellToRegionView(frame.cols * frame.rows).set(packed.cellToRegion);
        this.nodeCount = packed.nodeCount;
        this.edgeWrite = this.buildCsr(packed.nodeCount, packed.edgeWrite);
        this.nodeIds = packed.nodeIds;
        return { nodeCount: this.nodeCount, edgeWrite: this.edgeWrite, nodeIds: this.nodeIds };
    }
    assertCapacity(packed, frame) {
        if (packed.nodeCount > this.maxGraphNodes) throw new Error(`HPA region graph has ${packed.nodeCount} nodes (max ${this.maxGraphNodes})`);
        if (packed.edgeWrite > this.maxGraphEdges) throw new Error(`HPA region graph has ${packed.edgeWrite} edges (max ${this.maxGraphEdges})`);
        const cellCount = frame.cols * frame.rows;
        if (this.sabCellToRegion.byteLength < cellCount * 2) throw new Error(`HPA cell-to-region buffer has ${this.sabCellToRegion.byteLength} bytes (needs ${cellCount * 2})`);
    }
    buildCsr(nodeCount, edgeWrite) {
        const srcSources = this.edgeSourcesView(edgeWrite);
        const edgeOffsets = this.edgeOffsetsView();
        edgeOffsets.fill(0, 0, nodeCount + 1);
        for (let e = 0; e < edgeWrite; e++) {
            const src = srcSources[e];
            if (src >= 0 && src < nodeCount) edgeOffsets[src + 1]++;
        }
        let sum = 0;
        for (let i = 0; i < nodeCount; i++) {
            const count = edgeOffsets[i + 1];
            edgeOffsets[i] = sum;
            sum += count;
        }
        edgeOffsets[nodeCount] = sum;
        return sum;
    }
    flatGraphView() {
        return new FlatGraphView({ nodeIdx: this.nodeIdxView(this.nodeCount), cols: this.cols, edgeOffsets: this.edgeOffsetsView(this.nodeCount), edgeTargets: this.edgeTargetsView(this.edgeWrite), edgeCosts: this.edgeCostsView(this.edgeWrite), nodeCount: this.nodeCount, edgeWrite: this.edgeWrite, nodeIds: this.nodeIds });
    }
}
