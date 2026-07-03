import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { commitGridNavEditUnion } from "../Libraries/Sandbox/gridNavEdit.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { canStepPathIdx, createNavGraphView, createNavGraphViewWithLocalBake, validateBeltChain, snapNavGoalCellIndex, beltEntryNeighborAtIdx } from "../Libraries/Navigation/navGraph.js";
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
    it("belt local bake blocks wrong-way steps and allows side entry", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        grid.writeFloorCell(2 + 2 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        grid.writeFloorCell(3 + 2 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        grid.writeFloorCell(4 + 2 * grid.cols, FLOOR_CELL_KIND.Belt, 0);

        const graph = createNavGraphViewWithLocalBake(grid);
        const cols = grid.cols;
        const cellIndices = [
            colRowToIndex(2, 2, cols),
            colRowToIndex(3, 2, cols),
            colRowToIndex(4, 2, cols),
        ];
        assert.equal(validateBeltChain(graph, cellIndices).ok, true);
        assert.equal(graph.canStepIdx(colRowToIndex(2, 2, cols), colRowToIndex(3, 2, cols)), true);
        assert.equal(graph.canStepIdx(colRowToIndex(3, 2, cols), colRowToIndex(2, 2, cols)), false);
        assert.equal(graph.canStepIdx(colRowToIndex(2, 2, cols), colRowToIndex(2, 3, cols)), false);
        // Side entry is allowed:
        assert.equal(graph.canStepIdx(colRowToIndex(2, 3, cols), colRowToIndex(2, 2, cols)), true);
    });

    it("snapNavGoal routes through belt entry via navGraph", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        grid.writeFloorCell(3 + 3 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        const graph = createNavGraphView(grid);
        const cols = grid.cols;
        const snappedIdx = snapNavGoalCellIndex(grid, colRowToIndex(0, 3, cols), colRowToIndex(3, 3, cols));
        assert.equal(snappedIdx, colRowToIndex(2, 3, cols));
    });

    it("open belts allow side entry but only exit with belt flow", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        grid.writeFloorCell(3 + 3 * grid.cols, FLOOR_CELL_KIND.Belt, 1);
        const graph = createNavGraphViewWithLocalBake(grid);
        const cols = grid.cols;

        assert.equal(graph.canStepIdx(colRowToIndex(3, 2, cols), colRowToIndex(3, 3, cols)), true);
        assert.equal(graph.canStepIdx(colRowToIndex(2, 3, cols), colRowToIndex(3, 3, cols)), true);
        assert.equal(graph.canStepIdx(colRowToIndex(3, 3, cols), colRowToIndex(3, 4, cols)), true);
        assert.equal(graph.canStepIdx(colRowToIndex(3, 4, cols), colRowToIndex(3, 3, cols)), false);
        assert.equal(graph.canStepIdx(colRowToIndex(3, 3, cols), colRowToIndex(3, 2, cols)), false);
        assert.equal(graph.canStepIdx(colRowToIndex(3, 3, cols), colRowToIndex(4, 3, cols)), false);
    });

    it("HPA region graph inherits belt direction as directed edges", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 10 * 16, 10 * 16);
        grid.writeFloorCell(3 + 3 * grid.cols, FLOOR_CELL_KIND.Belt, 1);
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

        grid.writeFloorCell(2 + 2 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        grid.writeFloorCell(3 + 2 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        grid.writeFloorCell(4 + 2 * grid.cols, FLOOR_CELL_KIND.Belt, 0);

        await commitGridNavEditUnion(state, 26, 27, 28);
        await navigation.awaitWorkerNavReady();

        const graph = createNavGraphView(grid);
        const cols = grid.cols;
        const cellIndices = [
            colRowToIndex(2, 2, cols),
            colRowToIndex(3, 2, cols),
            colRowToIndex(4, 2, cols),
        ];
        assert.equal(validateBeltChain(graph, cellIndices).ok, true);
        assert.equal(graph.canStepIdx(colRowToIndex(2, 2, cols), colRowToIndex(3, 2, cols)), true);
        assert.equal(graph.canStepIdx(colRowToIndex(3, 2, cols), colRowToIndex(4, 2, cols)), true);
        assert.equal(graph.canStepIdx(colRowToIndex(3, 2, cols), colRowToIndex(2, 2, cols)), false);
        assert.equal(graph.canStepIdx(colRowToIndex(4, 2, cols), colRowToIndex(3, 2, cols)), false);

        const chainEntryIdx = beltEntryNeighborAtIdx(grid, colRowToIndex(2, 2, cols));
        assert.ok(chainEntryIdx >= 0);
        const goalEntryIdx = beltEntryNeighborAtIdx(grid, colRowToIndex(4, 2, cols));
        assert.ok(goalEntryIdx >= 0);
        const snappedFromOutside = snapNavGoalCellIndex(grid, chainEntryIdx, colRowToIndex(4, 2, cols));
        assert.equal(snappedFromOutside, goalEntryIdx);
        const snappedAtEntry = snapNavGoalCellIndex(grid, goalEntryIdx, colRowToIndex(4, 2, cols));
        assert.equal(snappedAtEntry, colRowToIndex(4, 2, cols));
        assert.ok(canStepPathIdx(graph, [chainEntryIdx, colRowToIndex(2, 2, cols), colRowToIndex(3, 2, cols), colRowToIndex(4, 2, cols)]));

        await terminateWorkerNavigation(navigation);
    });
});
