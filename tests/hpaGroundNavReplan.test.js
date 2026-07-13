import { createNavState, PathReplanManager, REPLAN_PRIORITY_TARGET, REPLAN_PRIORITY_VISIBLE, REPLAN_PRIORITY_STUCK_OFFSCREEN, HpaReplanRequest, HpaNavSession } from "../Libraries/Navigation/navigation.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { recomputeViewBounds, entityX, entityY, entityR } from "../Core/engineMemory.js";
const navSettings = { stuckReplanFrames: 20, stuckMoveThreshold: 1.5 };
const EID = 1;

function stampPose(x, y, r = 2) {
    entityX[EID] = x;
    entityY[EID] = y;
    entityR[EID] = r;
}

describe("hpa ground nav replan policy", () => {
    it("evaluates epoch replan due when path topology lags grid", () => {
        recomputeViewBounds(0, 0, 1e6, 1e6);
        stampPose(0, 0);
        const nav = createNavState();
        nav.pathLen = 10; // give it a path so it doesn't trigger noPath
        nav.pathSlot = 1;
        const manager = new PathReplanManager(nav);
        const state = { nav: { settings: navSettings, topologyKey: () => "key-b" }, viewport: {} };
        nav.topologyKey = "key-a";
        assert.equal(manager.evaluate(EID, state, false).reason, "epoch");

        nav.topologyKey = "key-b";
        assert.equal(manager.evaluate(EID, state, false).shouldReplan, false);
    });

    it("evaluates idlePathReplanReason correctly", () => {
        recomputeViewBounds(0, 0, 1e6, 1e6);
        stampPose(0, 0);
        const nav = createNavState();
        const manager = new PathReplanManager(nav);
        const state = { nav: { settings: navSettings, topologyKey: () => nav.topologyKey }, viewport: {} };

        assert.equal(manager.evaluate(EID, state, false).reason, "noPath");
        assert.equal(manager.evaluate(EID, state, true).shouldReplan, false);
    });

    it("trackNavStuck accumulates when the body barely moves", () => {
        stampPose(10, 10);
        const nav = createNavState();
        const manager = new PathReplanManager(nav);
        for (let i = 0; i < 25; i++) manager.trackStuck(EID, false, false, navSettings.stuckMoveThreshold);
        assert.ok(nav.stuckFrames > navSettings.stuckReplanFrames);
        stampPose(20, 20);
        manager.trackStuck(EID, false, false, navSettings.stuckMoveThreshold);
        assert.equal(nav.stuckFrames, 0);
    });

    it("evaluates offPath correctly", () => {
        recomputeViewBounds(0, 0, 1e6, 1e6);
        stampPose(10, 10);
        const nav = createNavState();
        nav.pathLen = 3;
        nav.pathSlot = 0;
        nav.lastOffPathReplan = 0;
        const manager = new PathReplanManager(nav);
        const state = { nav: { settings: navSettings }, viewport: {} };

        manager.updateClock(250);
        manager.trackStuck(EID, false, false, 0); // stuck frames = 1. softReplan requires > 10
        for (let i = 0; i < 15; i++) manager.trackStuck(EID, false, false, 2); // 15 stuck frames

        stampPose(0, 0);
        assert.equal(manager.evaluateOffPath(true, EID, state).reason, "offPath");

        manager.updateClock(10);
        assert.equal(manager.evaluateOffPath(true, EID, state).shouldReplan, false);
    });

    it("replanPriorityFor ranks target changes and visible agents ahead of off-screen", () => {
        assert.equal(PathReplanManager.getPriority("targetChange", false), REPLAN_PRIORITY_TARGET);
        assert.equal(PathReplanManager.getPriority("noPath", true), REPLAN_PRIORITY_VISIBLE);
        assert.equal(PathReplanManager.getPriority("epoch", false), REPLAN_PRIORITY_STUCK_OFFSCREEN);
    });
    it("keeps committed off-path routes while the agent is still making progress", () => {
        recomputeViewBounds(0, 0, 1e6, 1e6);
        stampPose(16, 160, 2);
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        let replans = 0;
        const worker = {
            releaseOwnedPathSlot() {},
            pathIdx(_slot, i) {
                return i === 0 ? worldIdxAtCell(grid, 4, 4) : worldIdxAtCell(grid, 5, 4);
            },
        };
        const state = {
            obstacleGrid: grid,
            viewport: {},
            nav: {
                settings: { stuckMoveThreshold: 0.5, stuckReplanFrames: 6, pathOffPathDistance: 4 },
                topologyKey: () => "",
                syncedTopologyKey: () => "",
                graphSyncGeneration: 0,
                worker,
                topology: null,
                session: {
                    isReplanInFlight: () => false,
                    requestReplan() {
                        replans++;
                        return true;
                    },
                },
            },
        };
        const session = new HpaNavSession();
        Object.assign(session.navState, { pathSlot: 0, pathLen: 2, topologyKey: "", lastOffPathReplan: -999 });
        const targetIdx = 5 + 4 * grid.cols;
        const targetX = grid.gridCenterXByIdx(targetIdx);
        const targetY = grid.gridCenterYByIdx(targetIdx);
        const pathSettings = { pathWaypointArrival: 1, arrivalDistance: 4, pathOffPathDistance: 4 };

        session.update(EID, targetX, targetY, state, 300, pathSettings);
        assert.equal(replans, 0);

        for (let i = 0; i < 5; i++) session.update(EID, targetX, targetY, state, 300, pathSettings);
        assert.equal(replans, 1);
    });
    it("records accepted route diagnostics when a path result is applied", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        const startIdx = 2 + 3 * grid.cols;
        const targetIdx = 4 + 3 * grid.cols;
        const startX = grid.gridCenterXByIdx(startIdx);
        const startY = grid.gridCenterYByIdx(startIdx);
        const targetX = grid.gridCenterXByIdx(targetIdx);
        const targetY = grid.gridCenterYByIdx(targetIdx);
        const nav = createNavState();
        nav.pendingReplanReason = "offPath";
        const worker = {
            releaseOwnedPathSlot() {},
            pathIdx(_slot, i) {
                return i === 0 ? worldIdxAtCell(grid, 2, 3) : worldIdxAtCell(grid, 4, 3);
            },
        };
        const request = new HpaReplanRequest({
            obstacleGrid: grid,
            startX,
            startY,
            targetX,
            targetY,
            graphEpoch: 1,
            topologyKey: "topology-a",
            navTopology: null,
            state: { obstacleGrid: grid },
        });

        request.applyResult(nav, worker, { pathSlot: 7, pathLen: 2 });

        assert.equal(nav.routeId, 1);
        assert.equal(nav.lastAcceptedRouteReason, "offPath");
        assert.equal(nav.lastAcceptedPathLen, 2);
        assert.equal(nav.lastAcceptedProgressIdx, 1);
        assert.equal(nav.lastAcceptedTargetX, targetX);
        assert.equal(nav.lastAcceptedTargetY, targetY);
        assert.equal(nav.pendingReplanReason, null);
    });
});
