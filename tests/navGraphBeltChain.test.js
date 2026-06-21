import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { writeNavFloorCell } from "../Libraries/Spatial/grid/navGridMutations.js";
import { commitGridNavEditUnion } from "../Libraries/Sandbox/gridNavEdit.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import {
    canStepPath,
    createNavGraphView,
    createNavGraphViewWithLocalBake,
    validateBeltChain,
    snapNavGraphGoalCell,
} from "../Libraries/Navigation/navGraph.js";
import { snapNavGoalCell } from "../Libraries/Navigation/snapNavGoal.js";
import { isBeltRailEdge } from "../Libraries/Spatial/grid/CellEdge.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { buildFullRegionGraph, packRegionGraphFlat } from "../Libraries/Pathfinding/hpaRegionGraph.js";

function createBeltChainTestState(grid) {
    return {
        obstacleGrid: grid,
        sandbox: {},
        worldSurfaces: { invalidateGridBounds: () => {} },
    };
}

function packedRegionHasEdge(packed, fromRegion, toRegion) {
    for (let i = 0; i < packed.edgeSources.length; i++) if (packed.edgeSources[i] === fromRegion && packed.edgeTargets[i] === toRegion) return true;
    return false;
}

describe("navGraph belt chain", () => {
    it("writeNavFloorCell syncs belt rails and local bake blocks wrong-way steps", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        writeNavFloorCell(grid, 2, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        writeNavFloorCell(grid, 3, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        writeNavFloorCell(grid, 4, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));

        assert.ok(isBeltRailEdge(grid.edgeStore.get(2, 2, 0, grid.cols)));
        assert.ok(isBeltRailEdge(grid.edgeStore.get(2, 2, 2, grid.cols)));

        const graph = createNavGraphViewWithLocalBake(grid);
        const cells = [
            { col: 2, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
            { col: 3, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
            { col: 4, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
        ];
        assert.equal(validateBeltChain(graph, cells).ok, true);
        assert.equal(graph.canStep(2, 2, 3, 2), true);
        assert.equal(graph.canStep(3, 2, 2, 2), false);
        assert.equal(graph.canStep(2, 2, 2, 3), false);
    });

    it("snapNavGoal routes through belt entry via navGraph", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        writeNavFloorCell(grid, 3, 3, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const graph = createNavGraphView(grid);
        const snapped = snapNavGraphGoalCell(graph, 0, 3, 3, 3);
        assert.deepEqual(snapped, snapNavGoalCell(grid, 0, 3, 3, 3));
        assert.equal(snapped.col, 2);
        assert.equal(snapped.row, 3);
    });

    it("open belts allow side entry but only exit with belt flow", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        writeNavFloorCell(grid, 3, 3, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(1));
        const graph = createNavGraphViewWithLocalBake(grid);

        assert.equal(graph.canStep(3, 2, 3, 3), true);
        assert.equal(graph.canStep(2, 3, 3, 3), true);
        assert.equal(graph.canStep(3, 3, 3, 4), true);
        assert.equal(graph.canStep(3, 4, 3, 3), false);
        assert.equal(graph.canStep(3, 3, 3, 2), false);
        assert.equal(graph.canStep(3, 3, 4, 3), false);
    });

    it("HPA region graph inherits belt direction as directed edges", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        writeNavFloorCell(grid, 3, 3, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(1));
        const graph = createNavGraphViewWithLocalBake(grid);
        const regionGraph = buildFullRegionGraph({
            blocked: graph.topology.blocked,
            frame: graph.frame,
            navGraph: graph,
            maxCellsPerChunk: 1,
            minCellsPerChunk: 0,
        });
        const packed = packRegionGraphFlat(regionGraph.nodesMap, regionGraph.cellToNode, graph.frame);
        const regionAt = (col, row) => packed.cellToRegion[colRowToIndex(col, row, grid.cols)];
        const west = regionAt(2, 3);
        const belt = regionAt(3, 3);
        const south = regionAt(3, 4);
        const east = regionAt(4, 3);

        assert.equal(packedRegionHasEdge(packed, west, belt), true);
        assert.equal(packedRegionHasEdge(packed, belt, south), true);
        assert.equal(packedRegionHasEdge(packed, belt, west), false);
        assert.equal(packedRegionHasEdge(packed, south, belt), false);
        assert.equal(packedRegionHasEdge(packed, belt, east), false);
    });

    it("commit union bake path: forward canStep, reverse blocked, snap, walk chain", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 12 * 16, 12 * 16);
        const state = createBeltChainTestState(grid);
        const navigation = await createWorkerNavigation(grid);
        state.nav = navigation;

        writeNavFloorCell(grid, 2, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        writeNavFloorCell(grid, 3, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        writeNavFloorCell(grid, 4, 2, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));

        await commitGridNavEditUnion(state, { startCol: 2, endCol: 4, startRow: 2, endRow: 2 });
        await navigation.awaitWorkerNavReady();

        const graph = createNavGraphView(grid);
        const cells = [
            { col: 2, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
            { col: 3, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
            { col: 4, row: 2, kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 },
        ];
        assert.equal(validateBeltChain(graph, cells).ok, true);
        assert.equal(graph.canStep(2, 2, 3, 2), true);
        assert.equal(graph.canStep(3, 2, 4, 2), true);
        assert.equal(graph.canStep(3, 2, 2, 2), false);
        assert.equal(graph.canStep(4, 2, 3, 2), false);

        const chainEntry = graph.beltEntryNeighbor(2, 2);
        assert.ok(chainEntry);
        const goalEntry = graph.beltEntryNeighbor(4, 2);
        assert.ok(goalEntry);
        const snappedFromOutside = snapNavGoalCell(grid, chainEntry.col, chainEntry.row, 4, 2);
        assert.equal(snappedFromOutside.col, goalEntry.col);
        assert.equal(snappedFromOutside.row, goalEntry.row);
        const snappedAtEntry = snapNavGoalCell(grid, goalEntry.col, goalEntry.row, 4, 2);
        assert.deepEqual(snappedAtEntry, { col: 4, row: 2 });
        assert.ok(canStepPath(graph, [chainEntry, { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }]));

        await terminateWorkerNavigation(navigation);
    });
});
