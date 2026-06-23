import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { resolveRelationshipFromProfile } from "../Libraries/Game/snake/agentRelationships.js";

describe("resolveRelationshipFromProfile", () => {
    it("returns static relationship strings from profile table", () => {
        applySnakeGameConfig();
        assert.equal(resolveRelationshipFromProfile(AGENT_PROFILE.snake, "flee_agent", 1, 2, { entityRegistry: { getLive: () => ({ faction: "a" }) } }), "prey");
        assert.equal(resolveRelationshipFromProfile(AGENT_PROFILE.flee, "snake", 1, 2, { entityRegistry: { getLive: () => ({ faction: "a" }) } }), "threat");
    });

    it("sizeBand same faction returns configured ally or neutral", () => {
        applySnakeGameConfig();
        const state = {
            entityRegistry: { getLive: () => ({ faction: "red" }) },
            kinetic: {},
            sandbox: {},
        };
        assert.equal(resolveRelationshipFromProfile(AGENT_PROFILE.snake, "snake", 1, 2, state), "ally");
        assert.equal(resolveRelationshipFromProfile(AGENT_PROFILE.squid, "snake", 1, 2, state), "neutral");
    });
});
