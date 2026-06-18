import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNavState } from "../Libraries/Pathfinding/navSession.js";
import { obstacleEpochReplanDue, idlePathReplanReason, trackNavStuck, offPathReplanDue } from "../Libraries/Pathfinding/hpaReplanPolicy.js";
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
        assert.equal(idlePathReplanReason(nav, navSettings, false, false), "noPath");
        assert.equal(idlePathReplanReason(nav, navSettings, false, true), null);
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
        assert.equal(idlePathReplanReason(nav, navSettings, false, false), "stuck");
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
});
