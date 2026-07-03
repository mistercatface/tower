import { unionCellBounds } from "../../DataStructures/CellRect.js";
/** @param {import("../../DataStructures/CellRect.js").CellBounds[]} parts */
export function mergeNavEditBoundsList(parts) {
    let merged = null;
    for (let i = 0; i < parts.length; i++) if (parts[i]) merged = unionCellBounds(merged, parts[i]);
    return merged;
}
