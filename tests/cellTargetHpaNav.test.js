import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { createCellTargetHpaNav } from "../Libraries/Sandbox/groundNav/cellTargetHpaNav.js";
import { writeNavFloorCell } from "../Libraries/Spatial/grid/navGridMutations.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { FLOOR_CELL_KIND, floorBeltFacingFromIndex } from "../Libraries/Spatial/grid/FloorCell.js";
import { FRAME_MS } from "./frameMs.js";
function createNavTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    let replanCalls = 0;
    const mockWorker = { getPathSlot: () => -1, releaseOwnedPathSlot: () => {}, releaseSlot: () => {}, requestPath: async () => ({ result: { pathLen: 0, pathSlot: -1, pathProgressIdx: 0 } }) };
    const session = new HpaPathSession(mockWorker);
    const origReplan = session.requestReplan.bind(session);
    session.requestReplan = (...args) => {
        replanCalls++;
        return origReplan(...args);
    };
    return {
        obstacleGrid: grid,
        nav: {
            settings: { stuckMoveThreshold: 0.5, stuckReplanFrames: 30, idlePathReplanMs: 5000 },
            topologyKey: () => "",
            syncedTopologyKey: () => "",
            graphSyncGeneration: 0,
            commitEdit: async () => {},
            worker: mockWorker,
            session,
            topology: null,
        },
        viewport: { circleInBounds: () => true },
        get replanCalls() {
            return replanCalls;
        },
    };
}
function testSeeker() {
    return { id: "head", x: 40, y: 56, radius: 8, vx: 0, vy: 0, strategy: { groundNav: {}, rolls: true } };
}
describe("cellTargetHpaNav", () => {
    it("setDestination stores cell center world coords", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        nav.setDestination(grid, 4, 6);
        assert.deepEqual(nav.getDestination(), { col: 4, row: 6, world: grid.gridToWorld(4, 6) });
    });
    it("tick requests replan when route is missing", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        nav.setDestination(grid, 2, 3);
        nav.tick(testSeeker(), FRAME_MS);
        assert.ok(state.replanCalls >= 1);
    });
    it("needsRetry is false while replan is pending", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        nav.setDestination(state.obstacleGrid, 2, 3);
        nav.tick(testSeeker(), FRAME_MS);
        assert.equal(nav.needsRetry(), false);
    });
    it("locked target does not clear when already inside arrival range", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const seeker = testSeeker();
        const world = grid.gridToWorld(2, 3);
        seeker.x = world.x;
        seeker.y = world.y;
        nav.setDestination(grid, 2, 3, { world, exactArrival: true, arrivalRadius: 20, lockOnTarget: true });
        nav.tick(seeker, FRAME_MS);
        const dest = nav.getDestination();
        assert.ok(dest);
        assert.equal(dest.lockOnTarget, true);
        assert.equal(dest.col, 2);
        assert.equal(dest.row, 3);
    });
    it("terminal-homes locked visible targets without requesting an HPA route", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const seeker = testSeeker();
        const target = grid.gridToWorld(7, 5);
        seeker.x = target.x - 10;
        seeker.y = target.y;
        nav.setDestination(grid, 7, 5, {
            world: target,
            exactArrival: true,
            arrivalRadius: 6,
            lockOnTarget: true,
            terminalHoming: { enabled: true, minHoldTicks: 0 },
        });

        nav.tick(seeker, FRAME_MS);

        assert.equal(state.replanCalls, 0);
        assert.equal(nav.getStatus().navPhase, "terminal_homing");
        assert.ok(seeker._groundRollDrive);
        assert.ok(seeker._groundRollDrive.dirX > 0);
    });
    it("does not terminal-home locked targets through walls", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const seeker = testSeeker();
        const start = grid.gridToWorld(4, 5);
        const target = grid.gridToWorld(6, 5);
        seeker.x = start.x;
        seeker.y = start.y;
        grid.grid[colRowToIndex(5, 5, grid.cols)] = 1;
        nav.setDestination(grid, 6, 5, {
            world: target,
            exactArrival: true,
            arrivalRadius: 6,
            lockOnTarget: true,
            terminalHoming: { enabled: true, handoffRadius: 64, minHoldTicks: 0 },
        });

        nav.tick(seeker, FRAME_MS);

        assert.notEqual(nav.getStatus().navPhase, "terminal_homing");
        assert.equal(nav.getStatus().targetLos, false);
        assert.ok(state.replanCalls >= 1);
    });
    it("updates same-cell locked terminal target without marking route changed", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const cell = grid.gridToWorld(6, 5);
        const firstWorld = { x: cell.x - 4, y: cell.y };
        const secondWorld = { x: cell.x + 4, y: cell.y };

        assert.equal(
            nav.setDestination(grid, 6, 5, {
                world: firstWorld,
                exactArrival: true,
                lockOnTarget: true,
                targetId: "food",
            }),
            true
        );
        assert.equal(nav.updateTerminalTarget(grid, { id: "food", ...secondWorld }, "food"), true);
        assert.deepEqual(nav.getDestination().world, secondWorld);
        assert.deepEqual(nav.getDestination().routeWorld, cell);
    });
    it("reports retry after sustained no-route frames before giving up", async () => {
        const state = createNavTestState();
        state.nav.settings.stuckReplanFrames = 4;
        const nav = createCellTargetHpaNav(state);
        const seeker = testSeeker();
        nav.setDestination(state.obstacleGrid, 2, 3);

        nav.tick(seeker, FRAME_MS);
        state.nav.session.flushFrame();
        await Promise.resolve();
        await Promise.resolve();
        nav.tick(seeker, FRAME_MS);

        assert.equal(nav.getDestination() != null, true);
        assert.equal(nav.needsRetry(), true);
    });
    it("gives up after frames without a route and stops replan spam", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const seeker = testSeeker();
        nav.setDestination(grid, 2, 3);
        nav.tick(seeker, FRAME_MS);
        const replansAfterFirstTick = state.replanCalls;
        assert.ok(replansAfterFirstTick >= 1);
        for (let i = 0; i < state.nav.settings.stuckReplanFrames; i++) nav.tick(seeker, FRAME_MS);
        assert.equal(nav.getDestination(), null);
        const replansAfterGiveUp = state.replanCalls;
        for (let i = 0; i < 5; i++) nav.tick(seeker, FRAME_MS);
        assert.equal(state.replanCalls, replansAfterGiveUp);
    });
    it("does not give up while riding a belt without a route", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const seeker = testSeeker();
        const beltCol = 2;
        const beltRow = 3;
        writeNavFloorCell(grid, beltCol, beltRow, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const beltWorld = grid.gridToWorld(beltCol, beltRow);
        seeker.x = beltWorld.x;
        seeker.y = beltWorld.y;
        nav.setDestination(grid, 8, 8);
        for (let i = 0; i < state.nav.settings.stuckReplanFrames + 5; i++) nav.tick(seeker, FRAME_MS);
        assert.ok(nav.getDestination());
    });
    it("clears ground roll drive while riding a belt", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const seeker = testSeeker();
        const beltCol = 2;
        const beltRow = 3;
        writeNavFloorCell(grid, beltCol, beltRow, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const beltWorld = grid.gridToWorld(beltCol, beltRow);
        seeker.x = beltWorld.x;
        seeker.y = beltWorld.y;
        seeker._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 600, maxSpeed: 180 };
        nav.setDestination(grid, 8, 8);
        nav.tick(seeker, FRAME_MS);
        assert.equal(seeker._groundRollDrive, undefined);
        assert.ok(nav.getDestination());
    });
    it("throttles belt handoff replans", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const grid = state.obstacleGrid;
        const seeker = testSeeker();
        const beltCol = 2;
        const beltRow = 3;
        writeNavFloorCell(grid, beltCol, beltRow, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const beltWorld = grid.gridToWorld(beltCol, beltRow);
        const offBeltWorld = grid.gridToWorld(3, 3);
        seeker.x = beltWorld.x;
        seeker.y = beltWorld.y;
        nav.setDestination(grid, 8, 8);
        nav.tick(seeker, FRAME_MS);
        seeker.x = offBeltWorld.x;
        seeker.y = offBeltWorld.y;
        nav.tick(seeker, FRAME_MS);
        const replansAfterHandoff = state.replanCalls;
        assert.ok(replansAfterHandoff >= 1);
        seeker.x = beltWorld.x;
        seeker.y = beltWorld.y;
        nav.tick(seeker, FRAME_MS);
        seeker.x = offBeltWorld.x;
        seeker.y = offBeltWorld.y;
        nav.tick(seeker, FRAME_MS);
        assert.equal(state.replanCalls, replansAfterHandoff);
    });
    it("clear removes destination and ground roll drive", () => {
        const state = createNavTestState();
        const nav = createCellTargetHpaNav(state);
        const seeker = testSeeker();
        seeker._groundRollDrive = { kind: "thrust" };
        nav.setDestination(state.obstacleGrid, 1, 1);
        nav.clear(seeker);
        assert.equal(nav.getDestination(), null);
        assert.equal(seeker._groundRollDrive, undefined);
    });
});
