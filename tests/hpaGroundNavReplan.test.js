import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNavState } from "../Libraries/Pathfinding/navSession.js";
import { obstacleEpochReplanDue, obstacleReplanAllowed, idlePathReplanReason, idlePathReplanAllowed, trackNavStuck, offPathReplanDue, sandboxReplanReason, sandboxReplanAllowed, replanPriorityFor, REPLAN_PRIORITY_TARGET, REPLAN_PRIORITY_VISIBLE, REPLAN_PRIORITY_STUCK_OFFSCREEN } from "../Libraries/Pathfinding/hpaReplanPolicy.js";
import { createHpaGroundNavSession } from "../Libraries/Sandbox/groundNav/hpaGroundNavSession.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { HpaReplanRequest } from "../Libraries/Pathfinding/hpaPathRequest.js";
const navSettings = { stuckReplanFrames: 20, stuckMoveThreshold: 1.5 };
describe("hpa ground nav replan policy", () => {
    it("obstacleEpochReplanDue when path topology lags grid", () => {
        const nav = createNavState();
        assert.equal(obstacleEpochReplanDue(nav, "key-a"), true);
        nav.topologyKey = "key-a";
        assert.equal(obstacleEpochReplanDue(nav, "key-a"), false);
        assert.equal(obstacleEpochReplanDue(nav, "key-b"), true);
    });
    it("idlePathReplanReason requests noPath when idle without a route", () => {
        const nav = createNavState();
        assert.equal(idlePathReplanReason(nav, navSettings, false), "noPath");
        assert.equal(idlePathReplanReason(nav, navSettings, true), null);
    });
    it("trackNavStuck accumulates when the body barely moves", () => {
        const nav = createNavState();
        for (let i = 0; i < 25; i++) trackNavStuck(nav, 10, 10, navSettings.stuckMoveThreshold);
        assert.ok(nav.stuckFrames > navSettings.stuckReplanFrames);
        trackNavStuck(nav, 20, 20, navSettings.stuckMoveThreshold);
        assert.equal(nav.stuckFrames, 0);
    });
    it("idlePathReplanReason returns stuck after enough stuck frames", () => {
        const nav = createNavState();
        nav.pathLen = 4;
        nav.pathSlot = 0;
        nav.stuckFrames = navSettings.stuckReplanFrames + 1;
        assert.equal(idlePathReplanReason(nav, navSettings, false), "stuck");
    });
    it("offPathReplanDue respects cooldown", () => {
        const nav = createNavState();
        nav.pathLen = 3;
        nav.pathSlot = 0;
        nav.lastOffPathReplan = 0;
        assert.equal(offPathReplanDue({ offPath: true }, nav, 250), true);
        nav.lastOffPathReplan = 100;
        assert.equal(offPathReplanDue({ offPath: true }, nav, 300), false);
        assert.equal(offPathReplanDue({ offPath: true }, nav, 351), true);
    });
    it("obstacleReplanAllowed defers off-screen until stuck", () => {
        assert.equal(obstacleReplanAllowed(false, 0, 20), false);
        assert.equal(obstacleReplanAllowed(false, 21, 20), true);
        assert.equal(obstacleReplanAllowed(true, 0, 20), true);
    });
    it("sandboxReplanReason and sandboxReplanAllowed gate off-screen idle replans", () => {
        const nav = createNavState();
        assert.equal(sandboxReplanReason(nav, true, false, 0, 0), "targetChange");
        assert.equal(sandboxReplanAllowed("targetChange", false, 0, 20), true);
        assert.equal(sandboxReplanReason(nav, false, false, 0, 0), "noPath");
        assert.equal(sandboxReplanAllowed("noPath", false, 0, 20), false);
        assert.equal(sandboxReplanAllowed("noPath", false, 25, 20), true);
        nav.pathLen = 2;
        nav.lastTargetX = 0;
        nav.lastTargetY = 0;
        assert.equal(sandboxReplanReason(nav, false, false, 100, 0), "targetMoved");
        assert.equal(sandboxReplanAllowed("targetMoved", false, 0, 20), false);
    });
    it("idlePathReplanAllowed requires visibility unless stuck", () => {
        const nav = createNavState();
        nav.stuckFrames = 5;
        assert.equal(idlePathReplanAllowed(nav, "noPath", false, 20), false);
        nav.stuckFrames = 25;
        assert.equal(idlePathReplanAllowed(nav, "noPath", false, 20), true);
        nav.stuckFrames = 0;
        assert.equal(idlePathReplanAllowed(nav, "noPath", true, 20), true);
    });
    it("replanPriorityFor ranks target changes and visible agents ahead of off-screen", () => {
        assert.equal(replanPriorityFor("targetChange", false), REPLAN_PRIORITY_TARGET);
        assert.equal(replanPriorityFor("noPath", true), REPLAN_PRIORITY_VISIBLE);
        assert.equal(replanPriorityFor("epoch", false), REPLAN_PRIORITY_STUCK_OFFSCREEN);
    });
    it("keeps committed off-path routes while the agent is still making progress", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        let replans = 0;
        const worker = {
            releaseOwnedPathSlot() {},
            pathCol(_slot, i) {
                return i === 0 ? 4 : 5;
            },
            pathRow() {
                return 4;
            },
        };
        const state = {
            obstacleGrid: grid,
            viewport: { circleInBounds: () => true },
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
        const session = createHpaGroundNavSession();
        Object.assign(session.navState, { pathSlot: 0, pathLen: 2, topologyKey: "", lastOffPathReplan: -999 });
        const prop = { x: 16, y: 160, radius: 2 };
        const target = grid.gridToWorld(5, 4);
        const pathSettings = { pathWaypointArrival: 1, arrivalDistance: 4, pathOffPathDistance: 4 };

        session.update(prop, target.x, target.y, state, 300, pathSettings);
        assert.equal(replans, 0);

        for (let i = 0; i < 5; i++) session.update(prop, target.x, target.y, state, 300, pathSettings);
        assert.equal(replans, 1);
    });
    it("records accepted route diagnostics when a path result is applied", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        const start = grid.gridToWorld(2, 3);
        const target = grid.gridToWorld(4, 3);
        const nav = createNavState();
        nav.pendingReplanReason = "offPath";
        const worker = {
            releaseOwnedPathSlot() {},
            pathCol(_slot, i) {
                return i === 0 ? 2 : 4;
            },
            pathRow() {
                return 3;
            },
        };
        const request = new HpaReplanRequest({
            obstacleGrid: grid,
            startX: start.x,
            startY: start.y,
            targetX: target.x,
            targetY: target.y,
            graphEpoch: 1,
            topologyKey: "topology-a",
            navTopology: null,
        });

        request.applyResult(nav, worker, { pathSlot: 7, pathLen: 2 });

        assert.equal(nav.routeId, 1);
        assert.equal(nav.lastAcceptedRouteReason, "offPath");
        assert.equal(nav.lastAcceptedPathLen, 2);
        assert.equal(nav.lastAcceptedProgressIdx, 1);
        assert.equal(nav.lastAcceptedTargetX, target.x);
        assert.equal(nav.lastAcceptedTargetY, target.y);
        assert.equal(nav.pendingReplanReason, null);
    });
});
