import { packCellKey } from "../DataStructures/CellKey.js";
export function createNavStepPenaltyLookup(cols, keys, costs) {
    if (!keys.length) return null;
    const byKey = new Map();
    for (let i = 0; i < keys.length; i++) byKey.set(keys[i], costs[i]);
    return {
        extraCostForIdx(cellIdx) {
            const col = cellIdx % cols;
            const row = (cellIdx / cols) | 0;
            return byKey.get(packCellKey(col, row)) ?? 0;
        },
        extraCostForCell(col, row) {
            return byKey.get(packCellKey(col, row)) ?? 0;
        },
    };
}
