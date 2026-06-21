import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createModePolicyLatch } from "../Libraries/AI/agentIntent/policyHysteresis.js";

describe("policy hysteresis", () => {
    it("holds a latched mode for minimum ticks before releasing", () => {
        const latch = createModePolicyLatch({ mode: "flee", minTicks: 2, holdReason: "flee_hysteresis" });
        assert.deepEqual(latch.apply({ mode: "flee", targetId: null }), { mode: "flee", targetId: null });
        assert.equal(latch.apply({ mode: "seek_food", targetId: 1 }).mode, "flee");
        assert.equal(latch.apply({ mode: "seek_food", targetId: 1 }).mode, "flee");
        assert.equal(latch.apply({ mode: "seek_food", targetId: 1 }).mode, "seek_food");
    });
    it("keeps holding while release conditions fail", () => {
        let safe = false;
        const latch = createModePolicyLatch({ mode: "flee", minTicks: 1, canRelease: () => safe });
        latch.apply({ mode: "flee", targetId: null });
        assert.equal(latch.apply({ mode: "explore", targetId: null }).mode, "flee");
        assert.equal(latch.apply({ mode: "explore", targetId: null }).mode, "flee");
        safe = true;
        assert.equal(latch.apply({ mode: "explore", targetId: null }).mode, "explore");
    });
});
