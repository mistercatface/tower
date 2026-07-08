import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid, setBoundary, clearBoundaryPrimary } from "../Libraries/Spatial/spatial.js";
import { bakeNavTopologyLocal } from "../Libraries/Navigation/navigation.js";

// Reproduces the incremental-bake halo bug: breaking a rail edge between two
// cells and re-baking with a TIGHT bounds (covering only one of the two cells)
// must still refresh canStep on BOTH sides of the shared (mirrored) edge.
describe("nav incremental bake halo", () => {
    it("re-bakes the neighbor across a broken mirrored edge with tight bounds", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160); // 10x10
        const cols = grid.cols;
        const a = 2 * cols + 2; // (col2,row2)
        const b = a + 1; // (col3,row2), east neighbor
        // Rail wall on the east side of A (mirrored onto west side of B).
        setBoundary(grid, a, 1, { capHeightLevel: 2, thicknessLevel: 1 });

        const t0 = bakeNavTopologyLocal(grid).navTopology;
        assert.ok(!t0.canStep(a, b), "wall must block A->B");
        assert.ok(!t0.canStep(b, a), "wall must block B->A");

        // Break the wall, then re-bake with a bounds covering ONLY cell A.
        clearBoundaryPrimary(grid, a, 1);
        const tightBounds = { startCol: 2, endCol: 2, startRow: 2, endRow: 2 };
        const t1 = bakeNavTopologyLocal(grid, tightBounds).navTopology;

        assert.ok(t1.canStep(a, b), "after break, A->B must be open (A is in bounds)");
        assert.ok(t1.canStep(b, a), "after break, B->A must be open (neighbor across broken edge)");
    });
});
