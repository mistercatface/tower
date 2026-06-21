import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { createCellTargetHpaNav } from "../Libraries/Sandbox/groundNav/cellTargetHpaNav.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { writeNavFloorCell } from "../Libraries/Spatial/grid/navGridMutations.js";
import { FLOOR_CELL_KIND, floorBeltFacingFromIndex } from "../Libraries/Spatial/grid/FloorCell.js";
import { FRAME_MS } from "./frameMs.js";
loadPropAssets();
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
