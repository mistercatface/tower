import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    collectVisibleGridCells,
    hasGridCellLineOfSight,
    isWorldPointInVisionCone,
    normalizeAngleDelta,
    queryGridCellVision,
    queryVisionCone,
    resolveObserverHeading,
} from "../Libraries/Navigation/perception/gridCellVision.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { setBoundary } from "../Libraries/Spatial/grid/boundaryOccupancy.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { appendGridCellVisionOverlayCommands } from "../Libraries/Navigation/perception/gridCellVisionOverlay.js";
function createVisionGrid(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return grid;
}
function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}
function cellCenter(grid, col, row) {
    return grid.gridToWorld(col, row);
}
function fillRectWalls(grid, c0, r0, c1, r1) {
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) stampWall(grid, col, row);
}
describe("grid cell line of sight", () => {
    it("blocks sight through a filled voxel column", () => {
        const grid = createVisionGrid();
        stampWall(grid, 6, 8);
        assert.equal(hasGridCellLineOfSight(grid, 2, 8, 10, 8), false);
        assert.equal(hasGridCellLineOfSight(grid, 2, 8, 4, 8), true);
    });
    it("blocks diagonal sight through a solid wall patch", () => {
        const grid = createVisionGrid();
        fillRectWalls(grid, 5, 4, 7, 10);
        assert.equal(hasGridCellLineOfSight(grid, 2, 8, 10, 6), false);
        assert.equal(hasGridCellLineOfSight(grid, 2, 8, 4, 8), true);
    });
    it("blocks sight through a rail wall on the shared edge graph", () => {
        const grid = createVisionGrid();
        setBoundary(grid, 6, 8, 1, { kind: "railWall", capHeightLevel: 1, thicknessLevel: 1 }, { bumpRevision: true });
        assert.equal(hasGridCellLineOfSight(grid, 2, 8, 10, 8), false);
        assert.equal(hasGridCellLineOfSight(grid, 2, 8, 4, 8), true);
        const observer = { id: 1, ...cellCenter(grid, 2, 8), vx: 10, vy: 0, facing: 0 };
        const behind = { id: 2, ...cellCenter(grid, 10, 8), radius: 6, isDead: false };
        const ahead = { id: 3, ...cellCenter(grid, 4, 8), radius: 6, isDead: false };
        const vision = queryGridCellVision(observer, [behind, ahead], { halfAngle: Math.PI / 3, range: 200, wallCtx: { obstacleGrid: grid } });
        assert.equal(vision.visible.length, 1);
        assert.equal(vision.visible[0].id, 3);
    });
});
describe("grid cell vision cone", () => {
    it("collectVisibleGridCells stops at a wall column ahead", () => {
        const grid = createVisionGrid();
        for (let row = 0; row < grid.rows; row++) stampWall(grid, 10, row);
        const origin = cellCenter(grid, 2, 8);
        const cells = collectVisibleGridCells(grid, origin.x, origin.y, 0, Math.PI / 3, 200);
        assert.ok(cells.length > 0);
        assert.ok(!cells.some((cell) => cell.col > 10));
        assert.ok(cells.some((cell) => cell.col === 9));
    });
    it("queryGridCellVision hides goal behind wall and keeps open corridor goal", () => {
        const grid = createVisionGrid();
        for (let row = 0; row < grid.rows; row++) stampWall(grid, 10, row);
        const ctx = { obstacleGrid: grid };
        const observer = { id: 1, x: cellCenter(grid, 2, 8).x, y: cellCenter(grid, 2, 8).y, vx: 10, vy: 0, facing: 0 };
        const behind = { id: 2, x: cellCenter(grid, 14, 8).x, y: cellCenter(grid, 14, 8).y, radius: 6, isDead: false };
        const ahead = { id: 3, x: cellCenter(grid, 6, 8).x, y: cellCenter(grid, 6, 8).y, radius: 6, isDead: false };
        const vision = queryGridCellVision(observer, [behind, ahead], { halfAngle: Math.PI / 3, range: 200, wallCtx: ctx });
        assert.equal(vision.visible.length, 1);
        assert.equal(vision.visible[0].id, 3);
        assert.ok(vision.cells.length > 0);
    });
    it("cannot see around an L-shaped corner", () => {
        const grid = createVisionGrid();
        fillRectWalls(grid, 8, 0, 8, 10);
        fillRectWalls(grid, 8, 10, 16, 10);
        const observer = cellCenter(grid, 4, 8);
        const aroundCorner = cellCenter(grid, 12, 4);
        const vision = queryGridCellVision({ id: 1, x: observer.x, y: observer.y, vx: 10, vy: 0, facing: 0 }, [{ id: 2, x: aroundCorner.x, y: aroundCorner.y, radius: 6, isDead: false }], {
            halfAngle: Math.PI / 2,
            range: 300,
            wallCtx: { obstacleGrid: grid },
        });
        assert.equal(vision.visible.length, 0);
        assert.ok(!vision.cells.some((cell) => cell.col === 12 && cell.row === 4));
    });
    it("goal outside arc is rejected even with clear grid LOS", () => {
        const grid = createVisionGrid();
        const observer = cellCenter(grid, 4, 8);
        const offAxis = cellCenter(grid, 8, 2);
        assert.equal(isWorldPointInVisionCone(observer.x, observer.y, -Math.PI / 2, Math.PI / 8, 200, offAxis.x, offAxis.y), false);
        const vision = queryGridCellVision({ id: 1, x: observer.x, y: observer.y, vx: 0, vy: -10, facing: -Math.PI / 2 }, [{ id: 2, x: offAxis.x, y: offAxis.y, radius: 6, isDead: false }], {
            halfAngle: Math.PI / 8,
            range: 200,
            wallCtx: { obstacleGrid: grid },
        });
        assert.equal(vision.visible.length, 0);
    });
    it("queryVisionCone delegates to grid cell vision", () => {
        const grid = createVisionGrid();
        stampWall(grid, 10, 8);
        const observer = { id: 1, ...cellCenter(grid, 2, 8), vx: 10, vy: 0, facing: 0 };
        const visible = { id: 2, ...cellCenter(grid, 6, 8), radius: 6, isDead: false };
        const blocked = { id: 3, ...cellCenter(grid, 14, 8), radius: 6, isDead: false };
        const cone = queryVisionCone(observer, [visible, blocked], { halfAngle: Math.PI / 2, range: 200, wallCtx: { obstacleGrid: grid } });
        assert.equal(cone.visible.length, 1);
        assert.equal(cone.visible[0].id, 2);
        assert.ok(cone.cells.length > 0);
    });
});
describe("grid cell vision overlay", () => {
    it("emits one cached highlight per visible cell", () => {
        const grid = createVisionGrid();
        const origin = cellCenter(grid, 4, 8);
        const cells = collectVisibleGridCells(grid, origin.x, origin.y, 0, Math.PI / 2, 96);
        const out = [];
        appendGridCellVisionOverlayCommands(out, { grid, cells });
        assert.equal(out.length, cells.length);
        for (let i = 0; i < out.length; i++) {
            assert.equal(out[i].kind, "aabb");
            assert.ok(out[i].cache);
        }
    });
});
describe("vision cone helpers", () => {
    it("normalizeAngleDelta wraps to [-pi, pi]", () => {
        assert.ok(Math.abs(normalizeAngleDelta(Math.PI * 3) - Math.PI) < 1e-6);
        assert.ok(Math.abs(normalizeAngleDelta(-Math.PI * 3) + Math.PI) < 1e-6);
    });
    it("isWorldPointInVisionCone rejects points outside arc and range", () => {
        assert.equal(isWorldPointInVisionCone(0, 0, 0, Math.PI / 4, 100, 50, 0), true);
        assert.equal(isWorldPointInVisionCone(0, 0, 0, Math.PI / 4, 100, 0, 80), false);
        assert.equal(isWorldPointInVisionCone(0, 0, 0, Math.PI / 4, 40, 100, 0), false);
    });
    it("resolveObserverHeading prefers velocity over facing", () => {
        assert.ok(Math.abs(resolveObserverHeading({ vx: 0, vy: 10, facing: 0 }) - Math.PI / 2) < 1e-6);
    });
});
