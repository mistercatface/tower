import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectVisibleGridCells, hasGridCellLineOfSight, resolveObserverHeading } from "../Libraries/Navigation/perception/gridCellVision.js";
import { createObserverVisionFrame, getVisionFullBuildCount, queryGridCellVision, resetVisionFullBuildCount } from "../Libraries/Navigation/perception/observerVisionFrame.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { setBoundary } from "../Libraries/Spatial/grid/boundaryOccupancy.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
async function createVisionGrid(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const navigation = await createWorkerNavigation(grid);
    return { grid, navTopology: navigation.topology, nav: navigation };
}
async function syncNavBounds(ctx, startCol, endCol, startRow, endRow) {
    await ctx.nav.commitEdit({ startCol, endCol, startRow, endRow });
}
async function stampWall(ctx, col, row) {
    const grid = ctx.grid;
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    await syncNavBounds(ctx, Math.max(0, col - 1), Math.min(grid.cols - 1, col + 1), Math.max(0, row - 1), Math.min(grid.rows - 1, row + 1));
}
function cellCenter(grid, col, row) {
    return grid.gridToWorld(col, row);
}
async function fillRectWalls(ctx, c0, r0, c1, r1) {
    const grid = ctx.grid;
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    await syncNavBounds(ctx, c0, c1, r0, r1);
}
describe("grid cell line of sight", () => {
    it("blocks sight through a filled voxel column", async () => {
        const ctx = await createVisionGrid();
        await stampWall(ctx, 6, 8);
        assert.equal(hasGridCellLineOfSight(ctx.navTopology, 2, 8, 10, 8), false);
        assert.equal(hasGridCellLineOfSight(ctx.navTopology, 2, 8, 4, 8), true);
        terminateWorkerNavigation(ctx.nav);
    });
    it("blocks diagonal sight through a solid wall patch", async () => {
        const ctx = await createVisionGrid();
        await fillRectWalls(ctx, 5, 4, 7, 10);
        assert.equal(hasGridCellLineOfSight(ctx.navTopology, 2, 8, 10, 6), false);
        assert.equal(hasGridCellLineOfSight(ctx.navTopology, 2, 8, 4, 8), true);
        terminateWorkerNavigation(ctx.nav);
    });
    it("blocks sight through a rail wall on the shared edge graph", async () => {
        const ctx = await createVisionGrid();
        setBoundary(ctx.grid, 6, 8, 1, { kind: "railWall", capHeightLevel: 1, thicknessLevel: 1 }, { bumpRevision: true });
        await syncNavBounds(ctx, 5, 7, 7, 9);
        assert.equal(hasGridCellLineOfSight(ctx.navTopology, 2, 8, 10, 8), false);
        assert.equal(hasGridCellLineOfSight(ctx.navTopology, 2, 8, 4, 8), true);
        const observer = { id: 1, ...cellCenter(ctx.grid, 2, 8), vx: 10, vy: 0, facing: 0 };
        const behind = { id: 2, ...cellCenter(ctx.grid, 10, 8), radius: 6, isDead: false };
        const ahead = { id: 3, ...cellCenter(ctx.grid, 4, 8), radius: 6, isDead: false };
        const vision = queryGridCellVision(observer, [behind, ahead], { range: 200, navTopology: ctx.navTopology });
        assert.equal(vision.visible.length, 1);
        assert.equal(vision.visible[0].id, 3);
        terminateWorkerNavigation(ctx.nav);
    });
});
describe("grid cell vision", () => {
    it("collectVisibleGridCells stops at a wall column ahead", async () => {
        const ctx = await createVisionGrid();
        for (let row = 0; row < ctx.grid.rows; row++) await stampWall(ctx, 10, row);
        const origin = cellCenter(ctx.grid, 2, 8);
        const cells = collectVisibleGridCells(ctx.navTopology, origin.x, origin.y, 200);
        assert.ok(cells.length > 0);
        assert.ok(!cells.some((cell) => cell.col > 10));
        assert.ok(cells.some((cell) => cell.col === 9));
        terminateWorkerNavigation(ctx.nav);
    });
    it("queryGridCellVision hides goal behind wall and keeps open corridor goal", async () => {
        const ctx = await createVisionGrid();
        for (let row = 0; row < ctx.grid.rows; row++) await stampWall(ctx, 10, row);
        const observer = { id: 1, x: cellCenter(ctx.grid, 2, 8).x, y: cellCenter(ctx.grid, 2, 8).y, vx: 10, vy: 0, facing: 0 };
        const behind = { id: 2, x: cellCenter(ctx.grid, 14, 8).x, y: cellCenter(ctx.grid, 14, 8).y, radius: 6, isDead: false };
        const ahead = { id: 3, x: cellCenter(ctx.grid, 6, 8).x, y: cellCenter(ctx.grid, 6, 8).y, radius: 6, isDead: false };
        const vision = queryGridCellVision(observer, [behind, ahead], { range: 200, navTopology: ctx.navTopology });
        assert.equal(vision.visible.length, 1);
        assert.equal(vision.visible[0].id, 3);
        assert.ok(vision.cells.length > 0);
        terminateWorkerNavigation(ctx.nav);
    });
    it("cannot see around an L-shaped corner", async () => {
        const ctx = await createVisionGrid();
        await fillRectWalls(ctx, 8, 0, 8, 10);
        await fillRectWalls(ctx, 8, 10, 16, 10);
        const observer = cellCenter(ctx.grid, 4, 8);
        const aroundCorner = cellCenter(ctx.grid, 12, 4);
        const vision = queryGridCellVision({ id: 1, x: observer.x, y: observer.y, vx: 10, vy: 0, facing: 0 }, [{ id: 2, x: aroundCorner.x, y: aroundCorner.y, radius: 6, isDead: false }], {
            range: 300,
            navTopology: ctx.navTopology,
        });
        assert.equal(vision.visible.length, 0);
        assert.ok(!vision.cells.some((cell) => cell.col === 12 && cell.row === 4));
        terminateWorkerNavigation(ctx.nav);
    });
    it("goal with clear grid LOS is visible in full circle", async () => {
        const ctx = await createVisionGrid();
        const observer = cellCenter(ctx.grid, 4, 8);
        const offAxis = cellCenter(ctx.grid, 8, 2);
        const vision = queryGridCellVision({ id: 1, x: observer.x, y: observer.y, vx: 0, vy: -10, facing: -Math.PI / 2 }, [{ id: 2, x: offAxis.x, y: offAxis.y, radius: 6, isDead: false }], {
            range: 200,
            navTopology: ctx.navTopology,
        });
        assert.equal(vision.visible.length, 1);
        assert.equal(vision.visible[0].id, 2);
        terminateWorkerNavigation(ctx.nav);
    });
    it("queryGridCellVision filters visible goals by wall only", async () => {
        const ctx = await createVisionGrid();
        await stampWall(ctx, 10, 8);
        const observer = { id: 1, ...cellCenter(ctx.grid, 2, 8), vx: 10, vy: 0, facing: 0 };
        const visible = { id: 2, ...cellCenter(ctx.grid, 6, 8), radius: 6, isDead: false };
        const blocked = { id: 3, ...cellCenter(ctx.grid, 14, 8), radius: 6, isDead: false };
        const result = queryGridCellVision(observer, [visible, blocked], { range: 200, navTopology: ctx.navTopology });
        assert.equal(result.visible.length, 1);
        assert.equal(result.visible[0].id, 2);
        assert.ok(result.cells.length > 0);
        terminateWorkerNavigation(ctx.nav);
    });
    it("observer vision frame reuses one full build per tick", async () => {
        resetVisionFullBuildCount();
        const ctx = await createVisionGrid();
        const visionRange = { range: 200 };
        const frame = createObserverVisionFrame({
            tickId: 9,
            navTopology: ctx.navTopology,
            visionRange,
            viewport: { circleInBounds: () => true },
            brainSyncOffScreenInterval: 1,
        });
        const observer = { id: 1, x: 128, y: 128, vx: 10, vy: 0, facing: 0, _brainSyncPass: 1 };
        frame.ensureHeadVision(observer);
        assert.equal(getVisionFullBuildCount(), 1);
        assert.ok(frame.readHeadVision(observer));
        assert.equal(getVisionFullBuildCount(), 1);
        const nextFrame = createObserverVisionFrame({
            tickId: 10,
            navTopology: ctx.navTopology,
            visionRange,
            viewport: { circleInBounds: () => true },
            brainSyncOffScreenInterval: 1,
        });
        nextFrame.ensureHeadVision(observer);
        assert.equal(getVisionFullBuildCount(), 2);
        terminateWorkerNavigation(ctx.nav);
    });
});
describe("observer heading", () => {
    it("resolveObserverHeading prefers velocity over facing", () => {
        assert.ok(Math.abs(resolveObserverHeading({ vx: 0, vy: 10, facing: 0 }) - Math.PI / 2) < 1e-6);
    });
});
describe("grid nav context", () => {
    it("does not mutate nav caches on repeated LOS queries when grid revision is unchanged", async () => {
        const ctx = await createVisionGrid();
        await stampWall(ctx, 6, 8);
        const revisionAfterStamp = ctx.navTopology.wallRevision;
        const openBefore = ctx.navTopology.navCardinalOpen.slice();
        for (let i = 0; i < 20; i++) hasGridCellLineOfSight(ctx.navTopology, 2, 8, 4, 8);
        assert.equal(ctx.navTopology.wallRevision, revisionAfterStamp);
        assert.deepEqual(Array.from(ctx.navTopology.navCardinalOpen), Array.from(openBefore));
        terminateWorkerNavigation(ctx.nav);
    });
});
