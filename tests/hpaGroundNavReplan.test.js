import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNavState } from "../Libraries/Pathfinding/navSession.js";
import { obstacleEpochReplanDue, idlePathReplanReason } from "../Libraries/Pathfinding/hpaReplanPolicy.js";
const navSettings = { stuckReplanFrames: 20 };
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
});
