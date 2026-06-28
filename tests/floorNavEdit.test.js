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
        nav: {
            commitEdit(bounds) {
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
    it("applyFloorCellEdit calls commitEdit with the edited cell index", async () => {
        const state = createNavEditTestState();
        await applyFloorCellEdit(state, 2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        assert.equal(state.syncBounds, 66);
    });

    it("clearFloorCellNavEdit resyncs after belt removal", async () => {
        const state = createNavEditTestState();
        state.obstacleGrid.writeFloorCell(2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        await clearFloorCellNavEdit(state, 2, 2);
        assert.equal(state.syncBounds, 66);
    });

    it("commitGridNavEdit supports full-grid sync", async () => {
        const state = createNavEditTestState();
        await commitGridNavEdit(state, null, { fullNavSync: true });
        assert.equal(state.syncBounds, null);
    });

    it("commitGridNavEditUnion commits each index", async () => {
        const state = createNavEditTestState();
        await commitGridNavEditUnion(state, 33, 67);
        assert.equal(state.syncCount, 2);
    });

    it("stampRailWallsBatch syncs nav once per batch", () => {
        const state = createNavEditTestState();
        state.worldSurfaces.settings = { maxWallHeightLevel: 4 };
        stampRailWallsBatch(state, [{ col: 2, row: 2, side: 0, heightLevel: 1, thicknessLevel: 1 }]);
        assert.equal(state.syncCount, 1);
    });
});
