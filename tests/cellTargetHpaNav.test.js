import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { createCellTargetHpaNav } from "../Libraries/Sandbox/groundNav/cellTargetHpaNav.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { FRAME_MS } from "./frameMs.js";
loadPropAssets();
function createNavTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    let replanCalls = 0;
    const mockWorker = { getPathSlot: () => -1, releaseOwnedPathSlot: () => {}, releaseSlot: () => {}, requestPath: async () => ({ result: { pathLen: 0, pathSlot: -1, pathProgressIdx: 0 } }) };
    const hpaPathSession = new HpaPathSession(mockWorker);
    const origReplan = hpaPathSession.requestReplan.bind(hpaPathSession);
    hpaPathSession.requestReplan = (...args) => {
        replanCalls++;
        return origReplan(...args);
    };
    return {
        obstacleGrid: grid,
        navigation: { obstacleGeneration: 0, settings: { stuckMoveThreshold: 0.5, stuckReplanFrames: 30, idlePathReplanMs: 5000 } },
        hpaPathWorker: mockWorker,
        hpaPathSession,
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
