import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HpaPathStitcher, stitchAbstractCellPath } from "../Libraries/Pathfinding/hpaStitch.js";

describe("HPA Path Stitching Suite", () => {
    it("stitches sequential legs together cleanly", () => {
        const prep = {
            nodeCount: 2,
            nodeCol: [10, 20],
            nodeRow: [10, 20],
            startCol: 5,
            startRow: 5,
            targetCol: 25,
            targetRow: 25,
        };

        const tempLegs = new Map();
        // A temp leg between start (nodeCount = 2) and region node 0
        tempLegs.set("2,0", [
            { col: 5, row: 5 },
            { col: 10, row: 10 }
        ]);
        // A temp leg between region node 1 and target (nodeCount + 1 = 3)
        tempLegs.set("1,3", [
            { col: 20, row: 20 },
            { col: 25, row: 25 }
        ]);

        // Mock resolver for the main region leg (from 0 to 1)
        const resolveRegionLeg = (aIdx, bIdx) => {
            if (aIdx === 0 && bIdx === 1) {
                return [
                    { col: 10, row: 10 },
                    { col: 15, row: 15 },
                    { col: 20, row: 20 }
                ];
            }
            return null;
        };

        const abstractIdx = [2, 0, 1, 3]; // start -> node 0 -> node 1 -> target
        const path = stitchAbstractCellPath(abstractIdx, prep, tempLegs, resolveRegionLeg);

        assert.ok(path);
        assert.deepEqual(path, [
            { col: 5, row: 5 },
            { col: 10, row: 10 },
            { col: 15, row: 15 },
            { col: 20, row: 20 },
            { col: 25, row: 25 }
        ], "Path should cleanly stitch without duplicate nodes at stitch boundaries");
    });

    it("uses class-based HpaPathStitcher to perform custom leg stitching", () => {
        const prep = {
            nodeCount: 1,
            nodeCol: [10],
            nodeRow: [10],
            startCol: 1,
            startRow: 1,
            targetCol: 20,
            targetRow: 20,
        };

        const tempLegs = new Map();
        const resolveRegionLeg = () => null;

        const stitcher = new HpaPathStitcher(prep, tempLegs, resolveRegionLeg);
        const path = stitcher.stitch([1, 0, 2]); // start (1) -> node 0 -> target (2)

        assert.ok(path);
        assert.deepEqual(path, [
            { col: 1, row: 1 },
            { col: 10, row: 10 },
            { col: 20, row: 20 }
        ]);
    });
});
