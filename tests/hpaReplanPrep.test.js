import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GridPathQuery } from "../Libraries/Pathfinding/AStar.js";
import { HpaAbstractGraph } from "../Libraries/Pathfinding/hpaReplanPrep.js";

describe("HpaAbstractGraph Suite", () => {
    it("can correctly find nearest region node", () => {
        const nodeCol = new Int16Array([10, 20]);
        const nodeRow = new Int16Array([10, 20]);
        const graph = new HpaAbstractGraph(nodeCol, nodeRow, null, null, null, 2, 0, ["A", "B"]);

        assert.equal(graph.nearestNodeIdx(11, 11), 0);
        assert.equal(graph.nearestNodeIdx(19, 19), 1);
    });

    it("can collect temporary connect candidates", () => {
        const nodeCol = new Int16Array([10, 20, 100]);
        const nodeRow = new Int16Array([10, 20, 100]);
        const edgeOffsets = new Int32Array([0, 1, 1, 1, 1]);
        const edgeTargets = new Int16Array([1]);
        const graph = new HpaAbstractGraph(nodeCol, nodeRow, edgeOffsets, edgeTargets, null, 3, 1, ["A", "B", "C"]);

        const startCandidates = graph.collectTempConnectCandidates(11, 11, true, 64);
        assert.ok(startCandidates.includes(0), "Should include the anchor node");
        assert.ok(startCandidates.includes(1), "Should include neighbors of anchor node for start candidate");

        const targetCandidates = graph.collectTempConnectCandidates(19, 19, false, 64);
        assert.ok(targetCandidates.includes(1), "Should include the anchor node");
        assert.ok(targetCandidates.includes(0), "Should include nodes with edges to the anchor node for target candidate");
    });

    it("can build extended abstract graph dynamically", () => {
        const nodeCol = new Int16Array([10]);
        const nodeRow = new Int16Array([10]);
        const edgeOffsets = new Int32Array([0, 0, 0]);
        const edgeTargets = new Int16Array([]);
        const edgeCosts = new Uint16Array([]);
        const graph = new HpaAbstractGraph(nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, 1, 0, ["A"]);

        const query = GridPathQuery.fromCells(2, 2, 18, 18);
        const resolveLegCost = (legQuery) => {
            return { cost: 5, path: [legQuery.start, legQuery.target] };
        };

        const { extendedGraph, startTemp, targetTemp, tempLegs } = graph.buildExtended(query, 64, resolveLegCost);

        assert.equal(extendedGraph.nodeCount, 3);
        assert.equal(extendedGraph.nodeCol[startTemp], 2);
        assert.equal(extendedGraph.nodeRow[startTemp], 2);
        assert.equal(extendedGraph.nodeCol[targetTemp], 18);
        assert.equal(extendedGraph.nodeRow[targetTemp], 18);

        assert.equal(extendedGraph.edgeWrite, 2);
        assert.equal(extendedGraph.edgeTargets[extendedGraph.edgeOffsets[startTemp]], 0);
        assert.equal(tempLegs.size, 2);
    });
});
