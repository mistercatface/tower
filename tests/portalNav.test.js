import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { PortalLink } from "../Libraries/Spatial/portals.js";
import { runKineticPhysics } from "../Libraries/Physics/physics.js";
import {
    bakeNavTopologyLocal,
    navCanStep,
    findSabPathProgressIdx,
    SearchState,
} from "../Libraries/Navigation/navigation.js";
import { createHpaWorkerSabPools, hpaPathSlotIdx } from "../Libraries/Navigation/hpaWorkerSab.js";
import { HpaBufferManager, HpaReplanPlanner } from "../Libraries/Navigation/HpaWorkerEntry.js";
import { mockHpaPathWorker } from "./harness/hpaPathSlotHarness.js";
import { mockCircleProp, createKineticTestTick, kineticPhysicsHooks } from "./harness/kineticTickHarness.js";

function createPortalPlanner(cols, rows) {
    const cellCount = cols * rows;
    const maxPathLen = cellCount;
    const pools = createHpaWorkerSabPools({ maxSlots: 1, maxPathLen });
    const buffers = new HpaBufferManager();
    buffers.init({
        maxSlots: 1,
        maxPathLen,
        maxCellsPerChunk: 16,
        minCellsPerChunk: 0,
        ...pools,
    });
    return new HpaReplanPlanner(buffers, new SearchState(cellCount + 2));
}

function portalShortcutGrid() {
    const cols = 24;
    const rows = 10;
    const gapRow = 5;
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    for (let row = 0; row < rows; row++) {
        if (row === gapRow) continue;
        grid.grid[grid.idx(12, row)] = 1;
    }
    const exitIdx = grid.idx(11, gapRow);
    const entryIdx = grid.idx(13, gapRow);
    PortalLink.setLink(grid, exitIdx, entryIdx);
    return { grid, cols, rows, exitIdx, entryIdx, startIdx: grid.idx(2, gapRow), targetIdx: grid.idx(21, gapRow) };
}

function farSideOnlyViaPortalGrid() {
    const cols = 20;
    const rows = 8;
    const row = 3;
    const wallCol = 14;
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    for (let r = 0; r < rows; r++) grid.grid[grid.idx(wallCol, r)] = 1;
    const exitIdx = grid.idx(wallCol - 1, row);
    const entryIdx = grid.idx(wallCol + 1, row);
    PortalLink.setLink(grid, exitIdx, entryIdx);
    return { grid, cols, rows, exitIdx, entryIdx, startIdx: grid.idx(2, row), targetIdx: grid.idx(18, row) };
}

function assertPathContinuous(path, len, frame, topology, portalTargetIdx) {
    for (let i = 1; i < len; i++) {
        const fromIdx = path[i - 1];
        const toIdx = path[i];
        const portalHop = portalTargetIdx[fromIdx] === toIdx;
        assert.ok(portalHop || navCanStep(frame, topology, fromIdx, toIdx), `path discontinuity at step ${i}: ${fromIdx} -> ${toIdx}`);
    }
}

describe("portal nav", () => {
    it("blocksStep prevents walking out of exit but allows walking in", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const eastNeighbor = exitIdx + 1;
        const westNeighbor = exitIdx - 1;
        assert.equal(PortalLink.blocksStep(grid, exitIdx, eastNeighbor), true);
        assert.equal(PortalLink.blocksStep(grid, westNeighbor, exitIdx), false);
        assert.equal(PortalLink.blocksStep(grid, entryIdx, eastNeighbor), false);
    });

    it("exit cell has no forward octile neighbors after bake", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const { frame, topology } = bakeNavTopologyLocal(grid);
        assert.equal(navCanStep(frame, topology, exitIdx, exitIdx + 1), false);
        assert.equal(navCanStep(frame, topology, exitIdx, exitIdx + grid.cols), false);
        assert.equal(navCanStep(frame, topology, exitIdx - 1, exitIdx), true);
    });

    it("findSabPathProgressIdx advances across portal hop without canStep", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const { navTopology } = bakeNavTopologyLocal(grid);
        const worker = mockHpaPathWorker(
            [
                { col: 1, row: 2 },
                { col: 2, row: 2 },
                { col: 8, row: 8 },
            ],
            grid,
        );
        const x = grid.gridCenterXByIdx(entryIdx);
        const y = grid.gridCenterYByIdx(entryIdx);
        const progress = findSabPathProgressIdx(x, y, worker, 0, 3, grid, navTopology);
        assert.ok(progress >= 2);
    });

    it("runKineticPhysics teleports body from exit to exact entry center", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const entryX = grid.gridCenterXByIdx(entryIdx);
        const entryY = grid.gridCenterYByIdx(entryIdx);
        const body = mockCircleProp(grid.gridCenterXByIdx(exitIdx), grid.gridCenterYByIdx(exitIdx), 5);
        const tick = createKineticTestTick([body], { cellSize: grid.cellSize });
        tick.world.obstacleGrid = grid;
        runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        assert.equal(body.x, entryX);
        assert.equal(body.y, entryY);
        assert.equal(body.vx, 0);
        assert.equal(body.vy, 0);
        assert.equal(body.angularVelocity, 0);
    });

    it("runKineticPhysics captures fast approach overlapping exit and zeros velocity at entry", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const exitIdx = grid.idx(2, 2);
        const entryIdx = grid.idx(8, 8);
        PortalLink.setLink(grid, exitIdx, entryIdx);
        const exitX = grid.gridCenterXByIdx(exitIdx);
        const exitY = grid.gridCenterYByIdx(exitIdx);
        const entryX = grid.gridCenterXByIdx(entryIdx);
        const entryY = grid.gridCenterYByIdx(entryIdx);
        const body = mockCircleProp(exitX - 6, exitY, 4);
        body.vx = 500;
        body.vy = 120;
        body.angularVelocity = 3;
        const tick = createKineticTestTick([body], { cellSize: grid.cellSize });
        tick.world.obstacleGrid = grid;
        runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        assert.equal(body.x, entryX);
        assert.equal(body.y, entryY);
        assert.equal(body.vx, 0);
        assert.equal(body.vy, 0);
        assert.equal(body.angularVelocity, 0);
    });

    it("simplified replan finds and writes path through portal shortcut", () => {
        const { grid, cols, rows, exitIdx, entryIdx, startIdx, targetIdx } = portalShortcutGrid();
        const { frame, topology } = bakeNavTopologyLocal(grid);
        const planner = createPortalPlanner(cols, rows);
        const context = {
            frame,
            topology,
            activePortalPairs: grid.activePortalPairs,
            activePortalCount: new Int32Array([grid.activePortalCount])
        };
        const result = planner.run(0, context, { startIdx, targetIdx });
        assert.ok(result?.pathLen > 0);
        const len = result.pathLen;
        const pathIdx = hpaPathSlotIdx(planner.buffers.sabPathIdxPool, 0, planner.buffers.maxPathLen);
        assert.equal(pathIdx[0], startIdx);
        assert.equal(pathIdx[len - 1], targetIdx);
        let hopAt = -1;
        for (let i = 1; i < len; i++) {
            if (pathIdx[i - 1] === exitIdx && pathIdx[i] === entryIdx) hopAt = i;
        }
        assert.ok(hopAt > 0, "path must route through portal hop");
        assertPathContinuous(pathIdx, len, frame, topology, grid.portalTargetIdx);
    });

    it("simplified replan routes path to portal-only-reachable far side", () => {
        const { grid, cols, rows, exitIdx, entryIdx, startIdx, targetIdx } = farSideOnlyViaPortalGrid();
        const { frame, topology } = bakeNavTopologyLocal(grid);
        const planner = createPortalPlanner(cols, rows);
        const context = {
            frame,
            topology,
            activePortalPairs: grid.activePortalPairs,
            activePortalCount: new Int32Array([grid.activePortalCount])
        };
        const result = planner.run(0, context, { startIdx, targetIdx });
        assert.ok(result?.pathLen > 0, "must find a path to the portal-only far side");
        const len = result.pathLen;
        const pathIdx = hpaPathSlotIdx(planner.buffers.sabPathIdxPool, 0, planner.buffers.maxPathLen);
        assert.equal(pathIdx[0], startIdx);
        assert.equal(pathIdx[len - 1], targetIdx);
        let hopAt = -1;
        for (let i = 1; i < len; i++) {
            if (pathIdx[i - 1] === exitIdx && pathIdx[i] === entryIdx) hopAt = i;
        }
        assert.ok(hopAt > 0, "path must cross the portal hop");
        assertPathContinuous(pathIdx, len, frame, topology, grid.portalTargetIdx);
    });
});
