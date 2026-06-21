import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    runCardinalAStarFlat,
    runLocalAStarFlat,
    runDijkstraFlat,
    runGreedyBestFirstFlat,
    runAbstractAStar,
    runAbstractAStarFlat
} from "../Libraries/Pathfinding/AStar.js";
import { SearchState } from "../Libraries/Pathfinding/SearchState.js";

describe("AStar Engine Search Suite", () => {
    const cols = 5;
    const rows = 5;
    const size = cols * rows;

    it("runCardinalAStarFlat finds orthogonal-only path avoiding simple wall", () => {
        const searchState = new SearchState(size);
        const isWall = (c, r) => (c === 2 && r === 1) || (c === 2 && r === 2);
        const navGraph = {
            canStep(c0, r0, c1, r1) {
                if (isWall(c1, r1)) return false;
                return true;
            }
        };

        const path = navGraph.canStep ? runCardinalAStarFlat(0, 2, 4, 2, navGraph, cols, rows, 20, searchState.prepare()) : null;
        assert.ok(path);
        for (let i = 1; i < path.length; i++) {
            const dc = Math.abs(path[i].col - path[i - 1].col);
            const dr = Math.abs(path[i].row - path[i - 1].row);
            assert.ok(dc + dr === 1, "Must only take orthogonal steps");
            assert.ok(!isWall(path[i].col, path[i].row), "Must not step on walls");
        }
        assert.deepEqual(path[0], { col: 0, row: 2 });
        assert.deepEqual(path[path.length - 1], { col: 4, row: 2 });
    });

    it("runLocalAStarFlat finds octile path cutting corners diagonally", () => {
        const searchState = new SearchState(size);
        const navGraph = { canStep: () => true };

        const path = runLocalAStarFlat(0, 0, 2, 2, navGraph, cols, rows, 20, searchState.prepare());
        assert.ok(path);
        assert.equal(path.length, 3);
        assert.deepEqual(path, [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 }
        ]);
    });

    it("runDijkstraFlat finds shortest path (uniform-cost)", () => {
        const searchState = new SearchState(size);
        const navGraph = { canStep: () => true };

        const path = runDijkstraFlat(0, 0, 2, 2, navGraph, cols, rows, 20, searchState.prepare());
        assert.ok(path);
        assert.equal(path.length, 3);
        assert.deepEqual(path, [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 }
        ]);
    });

    it("runGreedyBestFirstFlat finds a fast heuristic-focused path", () => {
        const searchState = new SearchState(size);
        const navGraph = { canStep: () => true };

        const path = runGreedyBestFirstFlat(0, 0, 2, 2, navGraph, cols, rows, 20, searchState.prepare());
        assert.ok(path);
        assert.deepEqual(path[path.length - 1], { col: 2, row: 2 });
    });

    it("runAbstractAStar solves simple object-based graph", () => {
        const nodesMap = {
            A: { id: "A", col: 0, row: 0, edges: [{ targetId: "B", cost: 10 }, { targetId: "C", cost: 100 }] },
            B: { id: "B", col: 2, row: 0, edges: [{ targetId: "C", cost: 5 }] },
            C: { id: "C", col: 4, row: 0, edges: [] }
        };

        const path = runAbstractAStar("A", "C", nodesMap);
        assert.ok(path);
        const ids = path.map(n => n.id);
        assert.deepEqual(ids, ["A", "B", "C"], "Should take the cheaper A -> B -> C route despite extra node");
    });

    it("runAbstractAStarFlat solves simple flat CSR graph", () => {
        const searchState = new SearchState(3);
        const nodeCol = new Int16Array([0, 2, 4]);
        const nodeRow = new Int16Array([0, 0, 0]);
        const edgeOffsets = new Int32Array([0, 2, 3, 3]);
        const edgeTargets = new Int32Array([1, 2, 2]);
        const edgeCosts = new Float32Array([10, 100, 5]);

        const path = runAbstractAStarFlat(0, 2, nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, 3, searchState.prepare());
        assert.ok(path);
        assert.deepEqual(Array.from(path), [0, 1, 2], "Should resolve flat indices 0 -> 1 -> 2");
    });
});
