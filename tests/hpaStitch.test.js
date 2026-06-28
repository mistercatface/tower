import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HpaPathStitcher, stitchAbstractCellPath } from "../Libraries/Pathfinding/hpaStitch.js";

describe("HPA Path Stitching Suite", () => {
    it("stitches sequential legs together cleanly", () => {
        const cols = 50;
        const prep = {
            nodeCount: 2,
            nodeCol: [10, 20],
            nodeRow: [10, 20],
            startIdx: 5 + 5 * cols,
            targetIdx: 25 + 25 * cols,
        };

        const tempLegsBuffer = new Int32Array(100);
        const tempLegsOffsets = new Map();
        const tempLegsLengths = new Map();

        const startIdx = 2;
        const node0Idx = 0;
        const key20 = (startIdx << 16) | node0Idx;
        tempLegsOffsets.set(key20, 0);
        tempLegsLengths.set(key20, 2);
        tempLegsBuffer[0] = 5 + 5 * cols;
        tempLegsBuffer[1] = 10 + 10 * cols;

        const node1Idx = 1;
        const targetIdx = 3;
        const key13 = (node1Idx << 16) | targetIdx;
        tempLegsOffsets.set(key13, 2);
        tempLegsLengths.set(key13, 2);
        tempLegsBuffer[2] = 20 + 20 * cols;
        tempLegsBuffer[3] = 25 + 25 * cols;

        const scratch = new Int32Array(100);
        const resolveRegionLeg = (aIdx, bIdx) => {
            if (aIdx === 0 && bIdx === 1) {
                scratch[0] = 10 + 10 * cols;
                scratch[1] = 15 + 15 * cols;
                scratch[2] = 20 + 20 * cols;
                return 3;
            }
            return 0;
        };
        resolveRegionLeg.scratch = scratch;

        const abstractIdx = [2, 0, 1, 3];
        const outCols = new Uint16Array(100);
        const outRows = new Uint16Array(100);
        const len = stitchAbstractCellPath(abstractIdx, prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, outCols, outRows, cols);

        assert.equal(len, 5);
        const path = [];
        for (let i = 0; i < len; i++) {
            path.push({ col: outCols[i], row: outRows[i] });
        }

        assert.deepEqual(path, [
            { col: 5, row: 5 },
            { col: 10, row: 10 },
            { col: 15, row: 15 },
            { col: 20, row: 20 },
            { col: 25, row: 25 }
        ], "Path should cleanly stitch without duplicate nodes at stitch boundaries");
    });

    it("uses class-based HpaPathStitcher to perform custom leg stitching", () => {
        const cols = 50;
        const prep = {
            nodeCount: 1,
            nodeCol: [10],
            nodeRow: [10],
            startIdx: 1 + 1 * cols,
            targetIdx: 20 + 20 * cols,
        };

        const tempLegsBuffer = new Int32Array(100);
        const tempLegsOffsets = new Map();
        const tempLegsLengths = new Map();
        const resolveRegionLeg = () => 0;

        const outCols = new Uint16Array(100);
        const outRows = new Uint16Array(100);
        const stitcher = new HpaPathStitcher(prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, cols);
        const len = stitcher.stitch([1, 0, 2], outCols, outRows);

        assert.equal(len, 3);
        const path = [];
        for (let i = 0; i < len; i++) {
            path.push({ col: outCols[i], row: outRows[i] });
        }
        assert.deepEqual(path, [
            { col: 1, row: 1 },
            { col: 10, row: 10 },
            { col: 20, row: 20 }
        ]);
    });
});
