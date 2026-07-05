import { FlatAbstractGraphSearch, FlatGraphView, FlatGridSearch, SearchState, FlatGridView } from "../Libraries/Navigation/navigation.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";


describe("AStar Engine Search Suite", () => {
    const cols = 5;
    const rows = 5;
    const size = cols * rows;

    it("FlatGridSearch.cardinal finds orthogonal-only path avoiding simple wall", () => {
        const searchState = new SearchState(size);
        const isWall = (c, r) => (c === 2 && r === 1) || (c === 2 && r === 2);
        const navGraph = {
            canStep(c0, r0, c1, r1) {
                if (isWall(c1, r1)) return false;
                return true;
            }
        };

        const gridView = new FlatGridView(cols, rows, { canStep: (idx0, idx1) => !isWall(idx1 % cols, (idx1 / cols) | 0) });
        const search = new FlatGridSearch(searchState);
        search.grid = gridView;
        const outPath = new Int32Array(100);
        const startIdx = 0 + 2 * cols;
        const targetIdx = 4 + 2 * cols;
        const len = search.cardinal(startIdx, targetIdx, 20, outPath);
        assert.ok(len > 0);
        const path = [];
        for (let i = 0; i < len; i++) {
            path.push({ col: outPath[i] % cols, row: (outPath[i] / cols) | 0 });
        }
        for (let i = 1; i < path.length; i++) {
            const dc = Math.abs(path[i].col - path[i - 1].col);
            const dr = Math.abs(path[i].row - path[i - 1].row);
            assert.ok(dc + dr === 1, "Must only take orthogonal steps");
            assert.ok(!isWall(path[i].col, path[i].row), "Must not step on walls");
        }
        assert.deepEqual(path[0], { col: 0, row: 2 });
        assert.deepEqual(path[path.length - 1], { col: 4, row: 2 });
    });

    it("FlatGridSearch.local finds octile path cutting corners diagonally", () => {
        const searchState = new SearchState(size);
        const navGraph = { canStep: () => true };

        const gridView = new FlatGridView(cols, rows, { canStep: () => true });
        const search = new FlatGridSearch(searchState);
        search.grid = gridView;
        const outPath = new Int32Array(100);
        const startIdx = 0 + 0 * cols;
        const targetIdx = 2 + 2 * cols;
        const len = search.local(startIdx, targetIdx, 20, outPath);
        assert.ok(len > 0);
        const path = [];
        for (let i = 0; i < len; i++) {
            path.push({ col: outPath[i] % cols, row: (outPath[i] / cols) | 0 });
        }
        assert.equal(path.length, 3);
        assert.deepEqual(path, [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 }
        ]);
    });

    it("FlatGridSearch.dijkstra finds shortest path (uniform-cost)", () => {
        const searchState = new SearchState(size);
        const navGraph = { canStep: () => true };

        const gridView = new FlatGridView(cols, rows, { canStep: () => true });
        const search = new FlatGridSearch(searchState);
        search.grid = gridView;
        const outPath = new Int32Array(100);
        const startIdx = 0 + 0 * cols;
        const targetIdx = 2 + 2 * cols;
        const len = search.dijkstra(startIdx, targetIdx, 20, outPath);
        assert.ok(len > 0);
        const path = [];
        for (let i = 0; i < len; i++) {
            path.push({ col: outPath[i] % cols, row: (outPath[i] / cols) | 0 });
        }
        assert.equal(path.length, 3);
        assert.deepEqual(path, [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 }
        ]);
    });

    it("FlatGridSearch.greedy finds a fast heuristic-focused path", () => {
        const searchState = new SearchState(size);
        const navGraph = { canStep: () => true };

        const gridView = new FlatGridView(cols, rows, { canStep: () => true });
        const search = new FlatGridSearch(searchState);
        search.grid = gridView;
        const outPath = new Int32Array(100);
        const startIdx = 0 + 0 * cols;
        const targetIdx = 2 + 2 * cols;
        const len = search.greedy(startIdx, targetIdx, 20, outPath);
        assert.ok(len > 0);
        const path = [];
        for (let i = 0; i < len; i++) {
            path.push({ col: outPath[i] % cols, row: (outPath[i] / cols) | 0 });
        }
        assert.deepEqual(path[path.length - 1], { col: 2, row: 2 });
    });

    it("FlatAbstractGraphSearch solves simple flat CSR graph", () => {
        const searchState = new SearchState(3);
        const cols = 10;
        const nodeIdx = new Int32Array([0, 2, 4]);
        const edgeOffsets = new Int32Array([0, 2, 3, 3]);
        const edgeTargets = new Int32Array([1, 2, 2]);
        const edgeCosts = new Float32Array([10, 100, 5]);

        const graph = new FlatGraphView({ nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount: 3 });
        const search = new FlatAbstractGraphSearch({ graph, searchState });
        const outPath = new Int32Array(10);
        const len = search.run(0, 2, outPath);
        assert.ok(len > 0);
        assert.deepEqual(Array.from(outPath.subarray(0, len)), [0, 1, 2], "Should resolve flat indices 0 -> 1 -> 2");
    });

    it("FlatAbstractGraphSearch prefers cheaper multi-hop route over direct edge", () => {
        const searchState = new SearchState(3);
        const cols = 10;
        const nodeIdx = new Int32Array([0, 1, 2]);
        const edgeOffsets = new Int32Array([0, 2, 3, 4]);
        const edgeTargets = new Int32Array([1, 2, 2]);
        const edgeCosts = new Float32Array([1, 10, 1]);
        const graph = new FlatGraphView({ nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount: 3 });
        const search = new FlatAbstractGraphSearch({ graph, searchState });
        const outPath = new Int32Array(10);
        const len = search.run(0, 2, outPath);
        assert.ok(len > 0);
        assert.deepEqual(Array.from(outPath.subarray(0, len)), [0, 1, 2]);
    });
});
