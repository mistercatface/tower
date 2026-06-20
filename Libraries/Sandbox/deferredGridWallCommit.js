import { unionCellBounds } from "../DataStructures/CellRect.js";
import { commitBoundaryEdit } from "./boundaryEdit.js";
import { clearGridWallsQuiet, clearRailWallsQuiet, clearVoxelWallsQuiet } from "./gridWallEdit.js";
/** Accumulate quiet wall clears and commit once via the same path as editor delete. */
/** @typedef {ReturnType<typeof createDeferredGridWallCommit>} DeferredGridWallCommit */
export function createDeferredGridWallCommit(state) {
    /** @type {import("../DataStructures/CellRect.js").CellBounds | null} */
    let pending = null;
    return {
        get pendingBounds() {
            return pending;
        },
        clearVoxel(col, row) {
            const bounds = clearVoxelWallsQuiet(state, [{ col, row }]);
            if (!bounds) return false;
            pending = unionCellBounds(pending, bounds);
            return true;
        },
        clearVoxels(voxels) {
            const bounds = clearVoxelWallsQuiet(state, voxels);
            if (!bounds) return false;
            pending = unionCellBounds(pending, bounds);
            return true;
        },
        clearRails(rails) {
            const bounds = clearRailWallsQuiet(state, rails);
            if (!bounds) return false;
            pending = unionCellBounds(pending, bounds);
            return true;
        },
        clearWalls({ voxels = [], rails = [] } = {}) {
            const bounds = clearGridWallsQuiet(state, { voxels, rails });
            if (!bounds) return false;
            pending = unionCellBounds(pending, bounds);
            return true;
        },
        flush() {
            if (!pending) return null;
            const bounds = pending;
            pending = null;
            commitBoundaryEdit(state, bounds);
            return bounds;
        },
    };
}
