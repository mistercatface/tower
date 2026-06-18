import { packCellKey } from "../../DataStructures/CellKey.js";
export function buildNavStepPenaltyFromSpatialMemory(spatial, { basePenalty = 6, falloff = 0.65 } = {}) {
    const keys = [];
    const costs = [];
    spatial.forEachNewestFirst((col, row, _seq, rankFromNewest) => {
        keys.push(packCellKey(col, row));
        costs.push(basePenalty * falloff ** rankFromNewest);
    });
    if (!keys.length) return null;
    return { keys: Int32Array.from(keys), costs: Float32Array.from(costs) };
}
