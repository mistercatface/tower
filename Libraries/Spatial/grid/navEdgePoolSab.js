export const NAV_EDGE_POOL_SAB_STRIDE = 4;
/** @param {number} refCount */
export function navEdgePoolSabByteLength(refCount) {
    return Math.max(refCount * NAV_EDGE_POOL_SAB_STRIDE, NAV_EDGE_POOL_SAB_STRIDE);
}
/** @param {import("./CellEdgeStore.js").CellEdgeStore} store @param {Uint8Array} bytes */
export function packEdgePoolToSab(store, bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pool = store.pool;
    for (let ref = 0; ref < pool.length; ref++) writeEdgeToSab(view, ref, pool[ref]);
    return pool.length;
}
/** @param {DataView} view @param {number} ref @param {object | undefined} edge */
function writeEdgeToSab(view, ref, edge) {
    const base = ref * NAV_EDGE_POOL_SAB_STRIDE;
    view.setInt16(base + 0, edge?.heightDelta ?? 0, true);
    view.setUint8(base + 2, edge?.thicknessLevel ?? 1);
}
/** Worker-owned pool objects — updated in place from SAB each nav sync. */
const workerEdgePool = [];
/** @param {Uint8Array} bytes @param {number} refCount */
export function bindNavEdgePoolFromSab(bytes, refCount) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (workerEdgePool.length < refCount) workerEdgePool.push({ heightDelta: 0, thicknessLevel: 1 });
    for (let ref = 0; ref < refCount; ref++) readEdgeFromSab(view, ref, workerEdgePool[ref]);
    workerEdgePool.length = refCount;
    return workerEdgePool;
}
/** @param {DataView} view @param {number} ref @param {Record<string, unknown>} out */
function readEdgeFromSab(view, ref, out) {
    const base = ref * NAV_EDGE_POOL_SAB_STRIDE;
    out.heightDelta = view.getInt16(base + 0, true);
    out.thicknessLevel = view.getUint8(base + 2) || 1;
}
