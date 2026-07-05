import { HpaAbstractGraph } from "../Libraries/Navigation/navigation.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";


describe("HpaAbstractGraph Suite", () => {
    it("can collect temporary connect candidates", () => {
        const cols = 200;
        const nodeIdx = new Int32Array([10 + 10 * cols, 20 + 20 * cols, 100 + 100 * cols]);
        const edgeOffsets = new Int32Array([0, 1, 1, 1, 1]);
        const edgeTargets = new Int16Array([1]);
        const graph = new HpaAbstractGraph(nodeIdx, cols, edgeOffsets, edgeTargets, null, 3, 1, ["A", "B", "C"]);

        const startCandidates = graph.collectTempConnectCandidates(11 + 11 * cols, true, 64);
        assert.ok(startCandidates.includes(0), "Should include the anchor node");
        assert.ok(startCandidates.includes(1), "Should include neighbors of anchor node for start candidate");

        const targetCandidates = graph.collectTempConnectCandidates(19 + 19 * cols, false, 64);
        assert.ok(targetCandidates.includes(1), "Should include the anchor node");
        assert.ok(targetCandidates.includes(0), "Should include nodes with edges to the anchor node for target candidate");
    });

    it("can build extended abstract graph dynamically", () => {
        const cols = 50;
        const nodeIdx = new Int32Array([10 + 10 * cols]);
        const edgeOffsets = new Int32Array([0, 0, 0]);
        const edgeTargets = new Int16Array([]);
        const edgeCosts = new Uint16Array([]);
        const graph = new HpaAbstractGraph(nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, 1, 0, ["A"]);

        const resolveLegCost = (lStartIdx, lTargetIdx, legKey, offset) => {
            return 5;
        };

        const startIdx = 2 + 2 * cols;
        const targetIdx = 18 + 18 * cols;
        const { extendedGraph, startTemp, targetTemp } = graph.buildExtended(startIdx, targetIdx, cols, { startRegion: -1, targetRegion: -1 }, 64, resolveLegCost);

        assert.equal(extendedGraph.nodeCount, 3);
        assert.equal(extendedGraph.nodeIdx[startTemp], startIdx);
        assert.equal(extendedGraph.nodeIdx[targetTemp], targetIdx);

        assert.equal(extendedGraph.edgeWrite, 2);
        assert.equal(extendedGraph.edgeTargets[extendedGraph.edgeOffsets[startTemp]], 0);
    });
});
