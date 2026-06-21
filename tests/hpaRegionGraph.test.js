import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFullRegionGraph, HpaRegionGraph, packRegionGraphFlat } from "../Libraries/Pathfinding/hpaRegionGraph.js";

const frame = { cols: 3, rows: 2, minX: 0, minY: 0, cellSize: 1 };

describe("HpaRegionGraph", () => {
    it("owns object-backed region membership and edge cleanup", () => {
        const graph = new HpaRegionGraph(frame);
        const a = graph.createRegionAtCell(0);
        const b = graph.createRegionAtCell(1);

        graph.assignCell(a, 0);
        graph.assignCell(b, 1);
        graph.connectEdge(a, b);
        graph.connectEdge(b, a);

        assert.equal(graph.nodeForCell(0), a);
        assert.equal(graph.nodeForCell(1), b);
        assert.deepEqual(a.edges, [{ targetId: b.id, cost: 1 }]);

        graph.removeRegion(b);

        assert.equal(graph.getNode(b.id), null);
        assert.equal(graph.nodeForCell(1), null);
        assert.deepEqual(a.edges, []);
    });

    it("packs the same flat graph through wrapper and legacy state", () => {
        const blocked = new Uint8Array(frame.cols * frame.rows);
        blocked[1] = 1;
        const navGraph = { canStep: () => true };
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0 });

        assert.ok(built.graph instanceof HpaRegionGraph);
        assert.equal(built.graph.nodesMap, built.nodesMap);
        assert.equal(built.graph.cellToNode, built.cellToNode);

        const fromGraph = packRegionGraphFlat(built.graph, built.cellToNode, frame);
        const fromLegacy = packRegionGraphFlat(built.nodesMap, built.cellToNode, frame);

        assert.deepEqual(Array.from(fromGraph.nodeCol), Array.from(fromLegacy.nodeCol));
        assert.deepEqual(Array.from(fromGraph.nodeRow), Array.from(fromLegacy.nodeRow));
        assert.deepEqual(Array.from(fromGraph.cellToRegion), Array.from(fromLegacy.cellToRegion));
        assert.deepEqual(Array.from(fromGraph.edgeSources), Array.from(fromLegacy.edgeSources));
        assert.deepEqual(Array.from(fromGraph.edgeTargets), Array.from(fromLegacy.edgeTargets));
        assert.deepEqual(Array.from(fromGraph.edgeCosts), Array.from(fromLegacy.edgeCosts));
    });
});
