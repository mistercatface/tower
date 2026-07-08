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
/**
 * @param {object} config
 * @param {number} config.maxSlots
 * @param {number} config.maxPathLen
 */
export function createHpaWorkerSabPools({ maxSlots, maxPathLen }) {
    return { sabPathMetaPool: new SharedArrayBuffer(maxSlots * HPA_PATH_META_STRIDE_BYTES), sabPathIdxPool: new SharedArrayBuffer(maxSlots * maxPathLen * 4), maxPathLen };
}
/** @param {SharedArrayBuffer} sabPathIdxPool @param {number} maxSlots @param {number} maxPathLen */
export function growHpaPathIdxSab(sabPathIdxPool, maxSlots, maxPathLen) {
    const byteLen = Math.max(maxSlots * maxPathLen * 4, 4);
    if (sabPathIdxPool.byteLength >= byteLen) return sabPathIdxPool;
    return new SharedArrayBuffer(byteLen);
}
