import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNavState } from "../Libraries/Pathfinding/navSession.js";
import {
    obstacleEpochReplanDue,
    obstacleReplanAllowed,
    idlePathReplanReason,
    idlePathReplanAllowed,
    trackNavStuck,
    offPathReplanDue,
    sandboxReplanReason,
    sandboxReplanAllowed,
    replanPriorityFor,
    REPLAN_PRIORITY_TARGET,
    REPLAN_PRIORITY_VISIBLE,
    REPLAN_PRIORITY_STUCK_OFFSCREEN,
} from "../Libraries/Pathfinding/hpaReplanPolicy.js";
const navSettings = { stuckReplanFrames: 20, stuckMoveThreshold: 1.5 };
describe("hpa ground nav replan policy", () => {
    it("obstacleEpochReplanDue when path epoch lags navigation graph", () => {
        const nav = createNavState();
        assert.equal(obstacleEpochReplanDue(nav, 0), true);
        nav.obstacleGeneration = 3;
        assert.equal(obstacleEpochReplanDue(nav, 3), false);
        assert.equal(obstacleEpochReplanDue(nav, 4), true);
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
});
