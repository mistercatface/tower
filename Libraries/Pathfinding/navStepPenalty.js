import { packCellKey, unpackCellKey } from "../DataStructures/CellKey.js";
export function createNavStepPenaltyLookup(cols, keys, costs) {
    const count = keys?.length ?? 0;
    if (!count) return null;
    const byKey = new Map();
    for (let i = 0; i < count; i++) byKey.set(keys[i], costs[i]);
    return {
        extraCostForIdx(cellIdx) {
            const col = cellIdx % cols;
            const row = (cellIdx / cols) | 0;
            return byKey.get(packCellKey(col, row)) ?? 0;
        },
        extraCostForCell(col, row) {
            return byKey.get(packCellKey(col, row)) ?? 0;
        },
        keys: keys.slice(0, count),
        costs: costs.slice(0, count),
    };
}
export function navStepPenaltyFromPackedCells(cols, packedKeys, recencyFromNewest, { basePenalty = 6, falloff = 0.65 } = {}) {
    const count = packedKeys.length;
    if (!count) return null;
    const keys = new Int32Array(count);
    const costs = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        keys[i] = packedKeys[i];
        costs[i] = basePenalty * falloff ** recencyFromNewest[i];
    }
    return { keys, costs };
}
export function decodeNavStepPenaltyKeys(packedKeys) {
    const out = [];
    for (let i = 0; i < packedKeys.length; i++) {
        const { col, row } = unpackCellKey(packedKeys[i]);
        out.push({ col, row });
    }
    return out;
}
