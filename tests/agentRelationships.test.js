import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { resolveRelationshipForInstances } from "../Libraries/Game/snake/agentRelationships.js";

function instance(profileId, { faction = "a", segments = 3 } = {}) {
    return { profileId, head: { faction }, memberIds: Array.from({ length: segments }, (_, i) => i) };
}
describe("resolveRelationshipForInstances", () => {
    it("returns static relationship strings from profile table", () => {
        applySnakeGameConfig();
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.snake), instance(AGENT_PROFILE.flee)), "prey");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.snake), instance(AGENT_PROFILE.squid)), "threat");
        const closeSq = 40 * 40;
        const farSq = 80 * 80;
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.flee), instance(AGENT_PROFILE.snake), undefined, closeSq), "threat");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.flee), instance(AGENT_PROFILE.snake), undefined, farSq), "prey");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.flee), instance(AGENT_PROFILE.squid)), "threat");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.squid), instance(AGENT_PROFILE.squid)), "threat");
    });

    it("squid proximity relationships attack close and ignore or flee at distance", () => {
        applySnakeGameConfig();
        const closeSq = 40 * 40;
        const farSq = 80 * 80;
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.squid), instance(AGENT_PROFILE.flee), undefined, closeSq), "prey");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.squid), instance(AGENT_PROFILE.flee), undefined, farSq), "neutral");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.squid), instance(AGENT_PROFILE.snake), undefined, closeSq), "prey");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.squid), instance(AGENT_PROFILE.squid), undefined, closeSq), "prey");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.squid), instance(AGENT_PROFILE.squid), undefined, farSq), "threat");
    });

    it("sizeBand same faction returns configured ally or neutral", () => {
        applySnakeGameConfig();
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.snake, { faction: "red", segments: 5 }), instance(AGENT_PROFILE.snake, { faction: "red", segments: 3 })), "ally");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.squid, { faction: "red" }), instance(AGENT_PROFILE.snake, { faction: "red" })), "neutral");
    });
});
