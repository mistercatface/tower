import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFloorCellEdit, clearFloorCellNavEdit, commitGridNavEdit, commitGridNavEditUnion } from "../Libraries/Spatial/spatial.js";
import { stampRailWallsBatch } from "../Libraries/Spatial/spatial.js";
import {  FLOOR_CELL_KIND  } from "../Libraries/Spatial/spatial.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";

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
        const idx = 2 + 2 * state.obstacleGrid.cols;
        await applyFloorCellEdit(state, idx, FLOOR_CELL_KIND.Belt, 0);
        assert.equal(state.syncBounds, idx);
    });

    it("clearFloorCellNavEdit resyncs after belt removal", async () => {
        const state = createNavEditTestState();
        const idx = 2 + 2 * state.obstacleGrid.cols;
        state.obstacleGrid.writeFloorCell(idx, FLOOR_CELL_KIND.Belt, 0);
        await clearFloorCellNavEdit(state, idx);
        assert.equal(state.syncBounds, idx);
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
