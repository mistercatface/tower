import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { bakeNavTopologyLocal } from "../Libraries/Pathfinding/bakeNavTopology.js";
import { buildNavReachHorizon } from "../Libraries/Navigation/navReachHorizon.js";
import { gridPathStepsBfs } from "../Libraries/Pathfinding/gridPathStepsBfs.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeReachConfig } from "../Libraries/Game/snake/snakeGameConfig.js";

function openGrid(cols = 12, rows = 12) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return grid;
}

function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
}

function cellWorld(grid, col, row) {
    return grid.gridToWorld(col, row);
}

function bake(grid) {
    return bakeNavTopologyLocal(grid).navTopology;
}

describe("gridPathStepsBfs", () => {
    it("returns null when start is blocked", () => {
        const grid = openGrid();
        stampWall(grid, 2, 2);
        const baked = bakeNavTopologyLocal(grid);
        const { topology, frame } = baked;
        const startIdx = colRowToIndex(2, 2, frame.cols);
        const targetIdx = colRowToIndex(4, 2, frame.cols);
        const steps = gridPathStepsBfs({
            neighborGrid: topology.octileNeighbors,
            cellCount: frame.cols * frame.rows,
            isBlocked: (idx) => topology.blocked[idx] !== 0,
            startIdx,
            targetIdx,
            maxSteps: 32,
        });
        assert.equal(steps, null);
    });
});

describe("buildNavReachHorizon", () => {
    it("reports straight-line path steps on an open grid", () => {
        const grid = openGrid();
        const navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const horizon = buildNavReachHorizon(navTopology, start.x, start.y, 32);
        assert.equal(horizon.stepsTo(cellWorld(grid, 5, 2).x, cellWorld(grid, 5, 2).y), 3);
        assert.equal(horizon.stepsTo(cellWorld(grid, 2, 5).x, cellWorld(grid, 2, 5).y), 3);
    });

    it("returns null beyond maxSteps", () => {
        const grid = openGrid();
        const navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const target = cellWorld(grid, 5, 2);
        const horizon = buildNavReachHorizon(navTopology, start.x, start.y, 2);
        assert.equal(horizon.stepsTo(target.x, target.y), null);
    });

    it("returns null when start cell is blocked", () => {
        const grid = openGrid();
        stampWall(grid, 2, 2);
        const navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const target = cellWorld(grid, 5, 2);
        const horizon = buildNavReachHorizon(navTopology, start.x, start.y, 32);
        assert.equal(horizon.stepsTo(target.x, target.y), null);
    });

    it("walks around a wall with more steps than euclidean cells", () => {
        const grid = openGrid();
        let navTopology = bake(grid);
        stampWall(grid, 3, 2);
        navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const target = cellWorld(grid, 5, 2);
        const horizon = buildNavReachHorizon(navTopology, start.x, start.y, 32);
        const steps = horizon.stepsTo(target.x, target.y);
        assert.ok(steps != null && steps > 3, `expected detour > 3, got ${steps}`);
    });

    it("changes topologyKey after grid edits", () => {
        const grid = openGrid();
        let navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const before = buildNavReachHorizon(navTopology, start.x, start.y, 32);
        stampWall(grid, 3, 2);
        navTopology = bake(grid);
        const after = buildNavReachHorizon(navTopology, start.x, start.y, 32);
        assert.notEqual(before.topologyKey, after.topologyKey);
    });

    it("returns null from stepsTo when nav topology is not ready", () => {
        const grid = openGrid();
        const navTopology = bake(grid);
        navTopology.invalidateLocalBake();
        const start = cellWorld(grid, 2, 2);
        const target = cellWorld(grid, 5, 2);
        const horizon = buildNavReachHorizon(navTopology, start.x, start.y, 32);
        assert.equal(horizon.stepsTo(target.x, target.y), null);
    });
});

describe("resolveSnakeReachConfig", () => {
    it("derives cell ranges from world-space defaults", () => {
        applySnakeGameConfig();
        const config = getSnakeGameConfig();
        const reach = resolveSnakeReachConfig(config, 16);
        assert.equal(reach.decisionReachHorizon, 32);
        assert.equal(reach.fleeRangeCells, Math.ceil(config.visionRange.range / 16));
        assert.equal(reach.lethalThreatRangeCells, Math.ceil(config.lethalThreatRange / 16));
    });
});
