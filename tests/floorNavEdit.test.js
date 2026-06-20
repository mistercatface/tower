import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFloorCellEdit, clearFloorCellNavEdit, commitGridNavEdit, commitGridNavEditUnion } from "../Libraries/Sandbox/gridNavEdit.js";
import { stampRailWallsBatch } from "../Libraries/Sandbox/gridWallEdit.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";

function createNavEditTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    let syncCount = 0;
    /** @type {import("../Libraries/DataStructures/CellRect.js").CellBounds | null} */
    let syncBounds = null;
    return {
        obstacleGrid: grid,
        sandbox: {},
        worldSurfaces: { invalidateGridBounds(bounds) { syncBounds = bounds; } },
        navigation: {
            onObstaclesChanged(bounds) {
                syncCount++;
                syncBounds = bounds;
                return Promise.resolve();
            },
        },
        get syncBounds() {
            return syncBounds;
        },
        get syncCount() {
            return syncCount;
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

    it("commitGridNavEditUnion merges bounds and syncs once", async () => {
        const state = createNavEditTestState();
        await commitGridNavEditUnion(state, { startCol: 1, endCol: 2, startRow: 1, endRow: 2 }, { startCol: 3, endCol: 4, startRow: 3, endRow: 4 });
        assert.equal(state.syncCount, 1);
        assert.deepEqual(state.syncBounds, { startCol: 1, endCol: 4, startRow: 1, endRow: 4 });
    });

    it("stampRailWallsBatch syncs nav once per batch", () => {
        const state = createNavEditTestState();
        state.worldSurfaces.settings = { maxWallHeightLevel: 4 };
        stampRailWallsBatch(state, [{ col: 2, row: 2, side: 0, heightLevel: 1, thicknessLevel: 1 }]);
        assert.equal(state.syncCount, 1);
    });
});
