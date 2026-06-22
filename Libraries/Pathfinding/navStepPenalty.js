import { packCellKey, KEY_STRIDE } from "../DataStructures/CellKey.js";
export function createNavStepPenaltyLookup(cols, keys, costs) {
    if (!keys.length) return null;
    let maxIdx = 0;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const col = key % KEY_STRIDE;
        const row = (key / KEY_STRIDE) | 0;
        const idx = row * cols + col;
        if (idx > maxIdx) maxIdx = idx;
    }
    const costArray = new Uint8Array(maxIdx + 1);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const col = key % KEY_STRIDE;
        const row = (key / KEY_STRIDE) | 0;
        const idx = row * cols + col;
        costArray[idx] = costs[i];
    }
    return {
        extraCostForIdx(cellIdx) {
            return cellIdx < costArray.length ? costArray[cellIdx] : 0;
        },
        extraCostForCell(col, row) {
            const idx = row * cols + col;
            return idx < costArray.length ? costArray[idx] : 0;
        },
    };
}
