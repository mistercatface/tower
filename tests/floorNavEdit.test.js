import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFloorCellEdit, clearFloorCellNavEdit, commitGridNavEdit } from "../Libraries/Sandbox/gridNavEdit.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";

function createNavEditTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    let syncBounds = null;
    return {
        obstacleGrid: grid,
        sandbox: {},
        worldSurfaces: { invalidateGridBounds(bounds) { syncBounds = bounds; } },
        navigation: {
            onObstaclesChanged(bounds) {
                syncBounds = bounds;
                return Promise.resolve();
            },
        },
        get syncBounds() {
            return syncBounds;
        },
    };
}

describe("gridNavEdit", () => {
    it("applyFloorCellEdit calls onObstaclesChanged with the edited cell bounds", async () => {
        const state = createNavEditTestState();
        await applyFloorCellEdit(state, 2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        assert.deepEqual(state.syncBounds, { startCol: 2, endCol: 2, startRow: 2, endRow: 2 });
    });

    it("clearFloorCellNavEdit resyncs after belt removal", async () => {
        const state = createNavEditTestState();
        state.obstacleGrid.writeFloorCell(2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        await clearFloorCellNavEdit(state, 2, 2);
        assert.deepEqual(state.syncBounds, { startCol: 2, endCol: 2, startRow: 2, endRow: 2 });
    });

    it("commitGridNavEdit supports full-grid sync", async () => {
        const state = createNavEditTestState();
        await commitGridNavEdit(state, null, { fullNavSync: true });
        assert.deepEqual(state.syncBounds, null);
    });
});
