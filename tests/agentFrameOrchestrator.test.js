import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentFrameOrchestrator } from "./harness/agentTestCompat.js";

function agent(id) {
    return { head: { id, x: 0, y: 0, radius: 1 } };
}

describe("agentFrameOrchestrator", () => {
    it("spreads thinker admission by head id phase", () => {
        const orchestrator = createAgentFrameOrchestrator({
            thinkPerFrame: 3,
            focusedThinkEveryFrame: true,
            onScreenThinkInterval: 1,
            offScreenThinkInterval: 4,
        });
        const state = { followCamera: { targetProp: null } };
        const viewport = { circleInBounds: () => true };
        const agents = Array.from({ length: 10 }, (_, i) => agent(i + 1));

        orchestrator.beginFrame(1, agents.length);
        const admitted = agents.filter((instance) => orchestrator.shouldThink(instance, state, viewport)).map((instance) => instance.head.id);

        assert.deepEqual(admitted, [1, 5, 9]);
    });
});
