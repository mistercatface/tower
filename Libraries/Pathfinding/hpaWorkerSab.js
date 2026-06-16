export const HPA_PATH_META_FIELDS = 2;
export const HPA_PATH_META_STRIDE_BYTES = HPA_PATH_META_FIELDS * 4;
/** @param {SharedArrayBuffer} sabPathMetaPool @param {number} slot */
export function hpaPathSlotMeta(sabPathMetaPool, slot) {
    return new Int32Array(sabPathMetaPool, slot * HPA_PATH_META_STRIDE_BYTES, HPA_PATH_META_FIELDS);
}
/** @param {SharedArrayBuffer} sabPathColsPool @param {number} slot @param {number} maxPathLen */
export function hpaPathSlotCols(sabPathColsPool, slot, maxPathLen) {
    return new Int16Array(sabPathColsPool, slot * maxPathLen * 2, maxPathLen);
}
/** @param {SharedArrayBuffer} sabPathRowsPool @param {number} slot @param {number} maxPathLen */
export function hpaPathSlotRows(sabPathRowsPool, slot, maxPathLen) {
    return new Int16Array(sabPathRowsPool, slot * maxPathLen * 2, maxPathLen);
}
/** @param {SharedArrayBuffer} sabAbstractIdxPool @param {number} slot @param {number} maxAbstractLen */
export function hpaPathSlotAbstractIdx(sabAbstractIdxPool, slot, maxAbstractLen) {
    return new Int16Array(sabAbstractIdxPool, slot * maxAbstractLen * 2, maxAbstractLen);
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
    return {
        sabPathMetaPool: new SharedArrayBuffer(maxSlots * HPA_PATH_META_STRIDE_BYTES),
        sabPathColsPool: new SharedArrayBuffer(maxSlots * maxPathLen * 2),
        sabPathRowsPool: new SharedArrayBuffer(maxSlots * maxPathLen * 2),
        sabAbstractIdxPool: new SharedArrayBuffer(maxSlots * maxAbstractLen * 2),
        sabPersistGraphNodeCol: new SharedArrayBuffer(maxGraphNodes * 2),
        sabPersistGraphNodeRow: new SharedArrayBuffer(maxGraphNodes * 2),
        sabPersistGraphEdgeOffsets: new SharedArrayBuffer((maxGraphNodes + 1) * 4),
        sabPersistGraphEdgeTargets: new SharedArrayBuffer(maxGraphEdges * 2),
        sabPersistGraphEdgeCosts: new SharedArrayBuffer(maxGraphEdges * 2),
        sabPersistGraphEdgeSources: new SharedArrayBuffer(maxGraphEdges * 2),
        sabCellToRegionIdx: new SharedArrayBuffer(4),
    };
}
/** @param {number} cellCount */
export function growHpaCellToRegionSab(sabCellToRegionIdx, cellCount) {
    const byteLen = Math.max(cellCount * 2, 4);
    if (sabCellToRegionIdx.byteLength >= byteLen) return sabCellToRegionIdx;
    return new SharedArrayBuffer(byteLen);
}
/** @param {SharedArrayBuffer} sab @param {number} nodeCount */
export function hpaPersistNodeColView(sab, nodeCount) {
    return new Int16Array(sab, 0, nodeCount);
}
/** @param {SharedArrayBuffer} sab @param {number} nodeCount */
export function hpaPersistNodeRowView(sab, nodeCount) {
    return new Int16Array(sab, 0, nodeCount);
}
/** @param {SharedArrayBuffer} sab @param {number} nodeCount */
export function hpaPersistEdgeOffsetsView(sab, nodeCount) {
    return new Int32Array(sab, 0, nodeCount + 1);
}
/** @param {SharedArrayBuffer} sab @param {number} edgeWrite */
export function hpaPersistEdgeTargetsView(sab, edgeWrite) {
    return new Int16Array(sab, 0, edgeWrite);
}
/** @param {SharedArrayBuffer} sab @param {number} edgeWrite */
export function hpaPersistEdgeCostsView(sab, edgeWrite) {
    return new Uint16Array(sab, 0, edgeWrite);
}
/** @param {SharedArrayBuffer} sab @param {number} edgeWrite */
export function hpaPersistEdgeSourcesView(sab, edgeWrite) {
    return new Int16Array(sab, 0, edgeWrite);
}
/** @param {SharedArrayBuffer} sab @param {number} cellCount */
export function hpaCellToRegionView(sab, cellCount) {
    return new Int16Array(sab, 0, cellCount);
}
