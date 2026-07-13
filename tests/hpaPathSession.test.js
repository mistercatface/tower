import { HpaPathSession, createNavState, buildReplanParams, REPLAN_PRIORITY_STUCK_OFFSCREEN, REPLAN_PRIORITY_VISIBLE } from "../Libraries/Navigation/navigation.js";
import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";

async function replanParams(grid) {
    const navigation = await createWorkerNavigation(grid);
    const request = buildReplanParams(grid, 40, 40, 120, 120, navigation, { obstacleGrid: grid });
    request._navigation = navigation;
    return request;
}
describe("HpaPathSession frame budget", () => {
    it("starts at most one frame budget of drains per flush", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
        const params = await replanParams(grid);
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        let started = 0;
        const mockWorker = {
            getPathSlot: () => -1,
            releaseOwnedPathSlot: () => {},
            releaseSlot: () => {},
            requestPath: async () => {
                started++;
                await gate;
                return { result: { pathLen: 0, pathSlot: -1, pathProgressIdx: 0 } };
            },
        };
        const session = new HpaPathSession(mockWorker, { frameStartBudget: 4, peakInflightCap: 4 });
        const navStates = Array.from({ length: 10 }, () => createNavState());
        session.beginFrame(1);
        for (let i = 0; i < navStates.length; i++) session.requestReplan(navStates[i], params, REPLAN_PRIORITY_STUCK_OFFSCREEN);
        session.flushFrame();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(started, 4);
        release();
        await gate;
        terminateWorkerNavigation(params._navigation);
    });
    it("prefers visible replans when the frame budget is tight", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
        const params = await replanParams(grid);
        const started = [];
        const mockWorker = {
            getPathSlot: () => -1,
            releaseOwnedPathSlot: () => {},
            releaseSlot: () => {},
            requestPath: async (request, navState) => {
                started.push(navState.label);
                await Promise.resolve();
                return { result: { pathLen: 0, pathSlot: -1, pathProgressIdx: 0 } };
            },
        };
        const session = new HpaPathSession(mockWorker, { frameStartBudget: 2, peakInflightCap: 2 });
        const lowA = createNavState();
        lowA.label = "lowA";
        const lowB = createNavState();
        lowB.label = "lowB";
        const highA = createNavState();
        highA.label = "highA";
        const highB = createNavState();
        highB.label = "highB";
        session.beginFrame(1);
        session.requestReplan(lowA, params, REPLAN_PRIORITY_STUCK_OFFSCREEN);
        session.requestReplan(lowB, params, REPLAN_PRIORITY_STUCK_OFFSCREEN);
        session.requestReplan(highA, params, REPLAN_PRIORITY_VISIBLE);
        session.requestReplan(highB, params, REPLAN_PRIORITY_VISIBLE);
        session.flushFrame();
        await Promise.resolve();
        assert.deepEqual(started.slice(0, 2), ["highA", "highB"]);
        terminateWorkerNavigation(params._navigation);
    });
});
