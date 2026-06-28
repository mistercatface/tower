import { commitGridNavEdit } from "./gridNavEdit.js";
import { clearVoxelWallQuiet } from "./gridWallEdit.js";
import { clearPrimaryBoundaryAt } from "./boundaryEdit.js";
import { bumpGridNavEpoch, GRID_NAV_EPOCH } from "../Spatial/grid/gridNavEpoch.js";
/** Accumulate quiet wall clears and commit once via the same path as editor delete. */
/** @typedef {ReturnType<typeof createDeferredGridWallCommit>} DeferredGridWallCommit */
export function createDeferredGridWallCommit(state) {
    const pending = new Set();
    return {
        get hasPending() {
            return pending.size > 0;
        },
        clearVoxel(idx) {
            if (!clearVoxelWallQuiet(state, idx)) return false;
            pending.add(idx);
            return true;
        },
        clearVoxels(voxelIndices) {
            let changed = false;
            for (let i = 0; i < voxelIndices.length; i++)
                if (clearVoxelWallQuiet(state, voxelIndices[i])) {
                    pending.add(voxelIndices[i]);
                    changed = true;
                }
            return changed;
        },
        clearRails(rails) {
            let changed = false;
            for (let i = 0; i < rails.length; i++) {
                const { idx, side } = rails[i];
                if (clearPrimaryBoundaryAt(state, idx, side) === "railWall") {
                    pending.add(idx);
                    changed = true;
                }
            }
            if (changed) bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
            return changed;
        },
        clearWalls({ voxels = [], rails = [] } = {}) {
            let changed = false;
            if (this.clearVoxels(voxels)) changed = true;
            if (this.clearRails(rails)) changed = true;
            return changed;
        },
        flush() {
            if (!pending.size) return false;
            for (const idx of pending) commitGridNavEdit(state, idx);
            pending.clear();
            return true;
        },
    };
}
