import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFloorCellEdit, clearFloorCellNavEdit, commitFloorNavEdit } from "../Libraries/Sandbox/floorNavEdit.js";
import { gridNavCacheKey } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";

describe("floorNavEdit", () => {
    it("applyFloorCellEdit calls onObstaclesChanged with the edited cell bounds", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        let syncBounds = null;
        const state = {
            obstacleGrid: grid,
            sandbox: {},
            navigation: {
                onObstaclesChanged(bounds) {
                    syncBounds = bounds;
                    return Promise.resolve();
                },
            },
            worldSurfaces: { invalidateGridBounds() {} },
        };
        const keyBefore = gridNavCacheKey(grid);
        await applyFloorCellEdit(state, 3, 4, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(1));
        assert.notEqual(gridNavCacheKey(grid), keyBefore);
        assert.deepEqual(syncBounds, { startCol: 3, endCol: 3, startRow: 4, endRow: 4 });
        assert.ok(grid.hasFloorBelt(3, 4));
    });

    it("clearFloorCellNavEdit resyncs after belt removal", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        grid.writeFloorCell(2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        let syncCalls = 0;
        const state = {
            obstacleGrid: grid,
            sandbox: {},
            navigation: { onObstaclesChanged() { syncCalls++; return Promise.resolve(); } },
            worldSurfaces: { invalidateGridBounds() {} },
        };
        await clearFloorCellNavEdit(state, 2, 2);
        assert.equal(syncCalls, 1);
        assert.equal(grid.hasFloorBelt(2, 2), false);
    });

    it("commitFloorNavEdit supports full-grid sync", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        let fullSync = false;
        const state = {
            obstacleGrid: grid,
            sandbox: {},
            navigation: { onObstaclesChanged(bounds) { fullSync = bounds === null; return Promise.resolve(); } },
            worldSurfaces: { invalidateGridBounds() {} },
        };
        await commitFloorNavEdit(state, null, { fullNavSync: true });
        assert.ok(fullSync);
    });
});
