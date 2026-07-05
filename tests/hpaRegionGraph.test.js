import { buildFullRegionGraph, HpaRegionGraph, packRegionGraphFlat } from "../Libraries/Navigation/navigation.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHpaWorkerSabPools, growHpaCellToRegionSab, PersistedHpaGraphWriter } from "../Libraries/Pathfinding/hpaWorkerSab.js";

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

    it("writes packed region graph into persisted CSR SAB views", () => {
        const maxGraphNodes = 4;
        const maxGraphEdges = 8;
        const buffers = {
            ...createHpaWorkerSabPools({ maxSlots: 1, maxPathLen: 4, maxAbstractLen: 4, maxGraphNodes, maxGraphEdges }),
            maxGraphNodes,
            maxGraphEdges,
        };
        buffers.sabCellToRegionIdx = growHpaCellToRegionSab(buffers.sabCellToRegionIdx, frame.cols * frame.rows);
        const writer = new PersistedHpaGraphWriter(buffers);
        const packed = {
            nodeCount: 3,
            nodeIdx: new Int32Array([0, 1, 2]),
            cellToRegion: new Int16Array([0, 1, 2, -1, -1, -1]),
            edgeSources: new Int16Array([0, 0, 1]),
            edgeTargets: new Int16Array([1, 2, 2]),
            edgeCosts: new Uint16Array([5, 9, 7]),
            edgeWrite: 3,
            nodeIds: ["node_1", "node_2", "node_3"],
        };

        const meta = writer.writePackedRegionGraph(packed, frame);

        assert.deepEqual(meta, { nodeCount: 3, edgeWrite: 3, nodeIds: packed.nodeIds });
        assert.deepEqual(Array.from(writer.nodeIdxView(3)), [0, 1, 2]);
        assert.deepEqual(Array.from(writer.edgeSourcesView(3)), [0, 0, 1]);
        assert.deepEqual(Array.from(writer.edgeTargetsView(3)), [1, 2, 2]);
        assert.deepEqual(Array.from(writer.edgeCostsView(3)), [5, 9, 7]);
        assert.deepEqual(Array.from(writer.edgeOffsetsView(3)), [0, 2, 3, 3]);
        assert.deepEqual(Array.from(writer.cellToRegionView(frame.cols * frame.rows)), [0, 1, 2, -1, -1, -1]);

        const graphView = writer.flatGraphView();
        assert.equal(graphView.nodeCount, 3);
        assert.equal(graphView.edgeWrite, 3);
        assert.equal(graphView.edgeTargets[graphView.edgeOffsets[1]], 2);
    });

    it("packs flat graph from HpaRegionGraph wrapper", () => {
        const blocked = new Uint8Array(frame.cols * frame.rows);
        blocked[1] = 1;
        const navGraph = { canStep: () => true, canStepIdx: () => true };
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0 });

        assert.ok(built.graph instanceof HpaRegionGraph);
        assert.equal(built.graph.nodesMap, built.nodesMap);
        assert.equal(built.graph.cellToNode, built.cellToNode);

        const packed = packRegionGraphFlat(built.graph, built.cellToNode, frame);
        assert.ok(packed.nodeCount > 0);
        assert.equal(packed.cellToRegion.length, frame.cols * frame.rows);
    });
});
