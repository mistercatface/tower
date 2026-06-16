import { EDGE_KIND, PASSAGE_MODE } from "./CellEdge.js";
export const NAV_EDGE_POOL_SAB_STRIDE = 24;
const KIND_TO_BYTE = { [EDGE_KIND.RailWall]: 1, [EDGE_KIND.BeltRail]: 2, [EDGE_KIND.Forcefield]: 3 };
const BYTE_TO_KIND = { 1: EDGE_KIND.RailWall, 2: EDGE_KIND.BeltRail, 3: EDGE_KIND.Forcefield };
const MODE_TO_BYTE = { [PASSAGE_MODE.Solid]: 0, [PASSAGE_MODE.OneWay]: 1, [PASSAGE_MODE.Tripwire]: 2 };
const BYTE_TO_MODE = { 0: PASSAGE_MODE.Solid, 1: PASSAGE_MODE.OneWay, 2: PASSAGE_MODE.Tripwire };
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
    for (let i = 0; i < NAV_EDGE_POOL_SAB_STRIDE; i++) view.setUint8(base + i, 0);
    if (!edge) return;
    view.setUint8(base + 0, KIND_TO_BYTE[edge.kind] ?? 0);
    if (edge.kind === EDGE_KIND.RailWall) {
        view.setInt16(base + 6, edge.heightDelta ?? 0, true);
        view.setUint8(base + 8, edge.thicknessLevel ?? 1);
        return;
    }
    if (edge.kind === EDGE_KIND.Forcefield) {
        view.setUint8(base + 1, MODE_TO_BYTE[edge.mode] ?? 0);
        view.setUint8(base + 2, edge.allowedSide ?? 0);
        view.setUint8(base + 5, edge.powered === true ? 1 : 0);
    }
}
/** Worker-owned pool objects — updated in place from SAB each nav sync. */
const workerEdgePool = [];
/** @param {Uint8Array} bytes @param {number} refCount */
export function bindNavEdgePoolFromSab(bytes, refCount) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (workerEdgePool.length < refCount) workerEdgePool.push({ kind: EDGE_KIND.RailWall, heightDelta: 0, thicknessLevel: 1 });
    for (let ref = 0; ref < refCount; ref++) readEdgeFromSab(view, ref, workerEdgePool[ref]);
    workerEdgePool.length = refCount;
    return workerEdgePool;
}
/** @param {DataView} view @param {number} ref @param {Record<string, unknown>} out */
function readEdgeFromSab(view, ref, out) {
    const base = ref * NAV_EDGE_POOL_SAB_STRIDE;
    const kindByte = view.getUint8(base + 0);
    delete out.mode;
    delete out.allowedSide;
    delete out.powered;
    delete out.heightDelta;
    delete out.thicknessLevel;
    if (kindByte === 1) {
        out.kind = EDGE_KIND.RailWall;
        out.heightDelta = view.getInt16(base + 6, true);
        out.thicknessLevel = view.getUint8(base + 8) || 1;
        return;
    }
    if (kindByte === 2) {
        out.kind = EDGE_KIND.BeltRail;
        return;
    }
    if (kindByte !== 3) {
        out.kind = EDGE_KIND.RailWall;
        out.heightDelta = 0;
        out.thicknessLevel = 1;
        return;
    }
    out.kind = EDGE_KIND.Forcefield;
    out.mode = BYTE_TO_MODE[view.getUint8(base + 1)] ?? PASSAGE_MODE.Solid;
    out.allowedSide = view.getUint8(base + 2);
    out.powered = view.getUint8(base + 5) === 1;
}
