import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE, getAgentProfile } from "../Libraries/AI/agents/AgentProfiles.js";
import { bakeRelationshipRules, resolveRelationshipForInstances } from "./harness/agentTestCompat.js";

function instance(profileId, { faction = "a", segments = 3 } = {}) {
    const config = getSnakeGameConfig();
    const profile = getAgentProfile(profileId, config);
    return {
        profileId,
        head: { faction },
        memberIds: Array.from({ length: segments }, (_, i) => i),
        relationshipRules: bakeRelationshipRules(profile, config),
    };
}
describe("resolveRelationshipForInstances", () => {
    it("returns static relationship strings from profile table", () => {
        applySnakeGameConfig();
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.snake), instance(AGENT_PROFILE.flee)), "prey");
        const closeSq = 40 * 40;
        const farSq = 80 * 80;
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.flee), instance(AGENT_PROFILE.snake), closeSq), "threat");
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.flee), instance(AGENT_PROFILE.snake), farSq), "prey");
    });

    it("sizeBand same faction returns configured ally or neutral", () => {
        applySnakeGameConfig();
        assert.equal(resolveRelationshipForInstances(instance(AGENT_PROFILE.snake, { faction: "red", segments: 5 }), instance(AGENT_PROFILE.snake, { faction: "red", segments: 3 })), "ally");
    });
});
