import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishAgentEngagement, readAgentEngagement, isAgentEngaged } from "../Libraries/AI/agents/agentEngagement.js";
import { createSnakeAgentSession } from "../Libraries/Game/snake/snakeAgentSession.js";
import { deriveSnakeEngagementState } from "../Libraries/Game/snake/snakeEngagement.js";
import { createSnakeDecisionBlackboard } from "../Libraries/Game/snake/snakeDecisionModel.js";

function blackboard(visible = {}, remembered = {}) {
    return createSnakeDecisionBlackboard({
        visibleWorld: {
            threat: null,
            prey: null,
            food: null,
            ally: null,
            ...visible,
        },
        memorySource: {
            threat: !!remembered.threat,
            prey: !!remembered.prey,
            food: !!remembered.food,
            ally: !!remembered.ally,
        },
        memoryWorld: remembered,
    });
}

describe("snake engagement", () => {
    it("publishAgentEngagement stores state on session", () => {
        const session = createSnakeAgentSession({}, { registry: { aliveByHeadId: new Map() }, navWalkable: null, speciesById: new Map() });
        const state = { active: true, salience: ["food"], mode: "seek_food" };
        publishAgentEngagement(session, 5, state);
        assert.deepEqual(readAgentEngagement(session, 5), state);
        assert.equal(isAgentEngaged(session, 5), true);
        assert.equal(isAgentEngaged(session, 6), false);
    });

    it("deriveSnakeEngagementState marks seek_food with visible food as active", () => {
        const food = { id: 1 };
        const bb = blackboard({ food });
        const engagement = deriveSnakeEngagementState(bb, { mode: "seek_food", targetId: 1 });
        assert.equal(engagement.active, true);
        assert.equal(engagement.mode, "seek_food");
        assert.deepEqual(engagement.salience, ["food"]);
    });

    it("deriveSnakeEngagementState marks explore and seek_ally as inactive", () => {
        const bb = blackboard({ food: { id: 1 } });
        assert.equal(deriveSnakeEngagementState(bb, { mode: "explore" }).active, false);
        assert.equal(deriveSnakeEngagementState(bb, { mode: "seek_ally", targetId: 2 }).active, false);
    });

    it("deriveSnakeEngagementState requires acting on salient target for active modes", () => {
        const bb = blackboard({ food: { id: 1 } });
        assert.equal(deriveSnakeEngagementState(bb, { mode: "seek_prey" }).active, false);
        assert.equal(deriveSnakeEngagementState(bb, { mode: "flee" }).active, false);
    });
});
