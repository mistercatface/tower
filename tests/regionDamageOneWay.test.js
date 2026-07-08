import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFullRegionGraph, rebuildDamagedRegionGraph } from "../Libraries/Navigation/navigation.js";

function makeFrame(cols, rows) {
    return { cols, rows, minX: 0, minY: 0, cellSize: 1 };
}

// Mutable directed-step mock. `open` is a Set of `${from}->${to}` allowed steps.
function makeNavGraph(open) {
    const step = (a, b) => open.has(`${a}->${b}`);
    return { canStep: step, canStepIdx: step };
}

function link(open, a, b, bidir = true) {
    open.add(`${a}->${b}`);
    if (bidir) open.add(`${b}->${a}`);
}

function edgeExists(graph, fromId, toId) {
    const node = graph.getNode(fromId);
    if (!node) return false;
    return node.edges.some((e) => e.targetId === toId);
}

function makeState(built, maxCellsPerChunk) {
    return { ...built, maxCellsPerChunk, minCellsPerChunk: 0, damagePadding: 12, distToWall: null };
}

describe("region damage one-way reconnect", () => {
    it("full build creates a directed edge across a one-way link", () => {
        const frame = makeFrame(6, 1);
        const blocked = new Uint8Array(6);
        const open = new Set();
        link(open, 0, 1);
        link(open, 1, 2);
        link(open, 3, 4);
        link(open, 4, 5);
        open.add("2->3"); // one-way 2 -> 3
        const navGraph = makeNavGraph(open);
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 6, minCellsPerChunk: 0 });
        const idA = built.cellToNode[0];
        const idB = built.cellToNode[5];
        assert.notEqual(idA, idB, "cells 0 and 5 must be in different regions");
        assert.ok(edgeExists(built.graph, idA, idB), "one-way 2->3 must yield directed region edge A->B");
        assert.ok(!edgeExists(built.graph, idB, idA), "reverse edge must not exist");
    });

    it("damage rebuild detects a NEW one-way link created by a wall break", () => {
        const frame = makeFrame(6, 1);
        const blocked = new Uint8Array(6);
        const open = new Set();
        link(open, 0, 1);
        link(open, 1, 2);
        link(open, 3, 4);
        link(open, 4, 5);
        // Phase 1: wall between 2 and 3, two disconnected regions.
        const navGraph = makeNavGraph(open);
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 6, minCellsPerChunk: 0 });
        const preA = built.cellToNode[0];
        const preB = built.cellToNode[5];
        assert.ok(!edgeExists(built.graph, preA, preB), "baseline must have no A->B edge");

        // Phase 2: break the wall -> one-way 2 -> 3 appears.
        open.add("2->3");
        const state = makeState(built, 6);
        rebuildDamagedRegionGraph(state, 2, frame, blocked, navGraph, null, null, null);

        const postA = state.cellToNode[0];
        const postB = state.cellToNode[5];
        assert.notEqual(postA, postB, "cells 0 and 5 still in different regions");
        assert.ok(edgeExists(state.graph, postA, postB), "damage rebuild must create directed edge A->B after wall break");
    });

    it("partial patch with small padding still connects regions spanning the box boundary", () => {
        const cols = 30;
        const frame = makeFrame(cols, 1);
        const blocked = new Uint8Array(cols);
        const open = new Set();
        for (let i = 0; i < cols - 1; i++) if (i !== 14) link(open, i, i + 1);
        const navGraph = makeNavGraph(open);
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 8, minCellsPerChunk: 0 });
        const preLeft = built.cellToNode[14];
        const preRight = built.cellToNode[15];
        assert.notEqual(preLeft, preRight, "cells 14 and 15 start in different regions");
        assert.ok(!edgeExists(built.graph, preLeft, preRight), "baseline: no edge across the wall");

        open.add("14->15"); // break wall -> one-way
        const state = { ...built, maxCellsPerChunk: 8, minCellsPerChunk: 0, damagePadding: 2, distToWall: null };
        rebuildDamagedRegionGraph(state, 14, frame, blocked, navGraph, null, null, null);

        const leftId = state.cellToNode[14];
        const rightId = state.cellToNode[15];
        assert.notEqual(leftId, rightId, "still different regions");
        assert.ok(edgeExists(state.graph, leftId, rightId), "small-padding partial patch must connect across new one-way link");
    });

    it("damage rebuild detects a one-way floor->belt link (rail break onto a belt cell)", () => {
        // 3x3 grid, belt at center cell 4. Entry W (from 3), exit E (to 5). Rails N,S.
        const frame = makeFrame(3, 3);
        const blocked = new Uint8Array(9);
        const floorPacked = new Uint8Array(9);
        floorPacked[4] = 0b0111; // arbitrary non-zero belt packing
        const open = new Set();
        // Floor ring (all bidirectional), excludes belt cell 4.
        link(open, 0, 1);
        link(open, 1, 2);
        link(open, 0, 3);
        link(open, 3, 6);
        link(open, 6, 7);
        link(open, 7, 8);
        link(open, 2, 5);
        link(open, 5, 8);
        // Belt entry/exit one-way.
        open.add("3->4"); // enter via W entry
        open.add("4->5"); // exit via E
        const navGraph = makeNavGraph(open);
        const built = buildFullRegionGraph({ blocked, frame, navGraph, maxCellsPerChunk: 16, minCellsPerChunk: 0, floorPacked });
        const beltId = built.cellToNode[4];

        // Break the north rail: one-way 1 -> 4 (step down onto belt from the north).
        open.add("1->4");
        const state = makeState(built, 16);
        state.floorPacked = floorPacked;
        rebuildDamagedRegionGraph(state, 4, frame, blocked, navGraph, null, null, floorPacked);

        const northId = state.cellToNode[1];
        const postBeltId = state.cellToNode[4];
        assert.notEqual(northId, postBeltId, "north floor and belt are different regions");
        assert.ok(edgeExists(state.graph, northId, postBeltId), "rail break must create directed floor->belt edge");
    });
});
