import { packCellKey } from "../../DataStructures/CellKey.js";
export function buildNavStepPenaltyFromSpatialMemory(spatial, { basePenalty, falloff }) {
    const keys = [];
    const costs = [];
    spatial.forEachNewestFirst((col, row, _seq, rankFromNewest) => {
        keys.push(packCellKey(col, row));
        costs.push(basePenalty * falloff ** rankFromNewest);
    });
    if (!keys.length) return null;
    return { keys: Int32Array.from(keys), costs: Float32Array.from(costs) };
}
