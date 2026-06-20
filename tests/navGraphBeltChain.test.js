import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { writeNavFloorCell } from "../Libraries/Spatial/grid/navGridMutations.js";
import { createNavGraphView, createNavGraphViewWithLocalBake, validateBeltChain, snapNavGraphGoalCell } from "../Libraries/Navigation/navGraph.js";
import { snapNavGoalCell } from "../Libraries/Navigation/snapNavGoal.js";
import { isBeltRailEdge } from "../Libraries/Spatial/grid/CellEdge.js";

describe("navGraph belt chain", () => {
    it("writeNavFloorCell syncs belt rails and local bake blocks wrong-way steps", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        writeNavFloorCell(grid, 2, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        writeNavFloorCell(grid, 3, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        writeNavFloorCell(grid, 4, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));

        assert.ok(isBeltRailEdge(grid.edgeStore.get(2, 2, 0, grid.cols)));
        assert.ok(isBeltRailEdge(grid.edgeStore.get(2, 2, 2, grid.cols)));

        const graph = createNavGraphViewWithLocalBake(grid);
        const cells = [
            { col: 2, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
            { col: 3, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
            { col: 4, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
        ];
        assert.equal(validateBeltChain(graph, cells).ok, true);
        assert.equal(graph.canStep(2, 2, 3, 2), true);
        assert.equal(graph.canStep(3, 2, 2, 2), false);
        assert.equal(graph.canStep(2, 2, 2, 3), false);
    });

    it("snapNavGoal routes through belt entry via navGraph", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        writeNavFloorCell(grid, 3, 3, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const graph = createNavGraphView(grid);
        const snapped = snapNavGraphGoalCell(graph, 0, 3, 3, 3);
        assert.deepEqual(snapped, snapNavGoalCell(grid, 0, 3, 3, 3));
        assert.equal(snapped.col, 2);
        assert.equal(snapped.row, 3);
    });
});
