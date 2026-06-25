import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { resolveRelationshipForInstances } from "../Libraries/Game/snake/agentRelationships.js";
import { SNAKE_GAME_SPECIES } from "../Libraries/Game/snake/species/index.js";

function dummyInstance(profileId, { faction = "a", segments = 1 } = {}) {
    return { profileId, head: { faction }, memberIds: Array.from({ length: segments }, (_, i) => i) };
}

describe("gun agent profile and species", () => {
    it("registers gun agent profile and matches config rules", () => {
        applySnakeGameConfig();
        
        assert.equal(AGENT_PROFILE.gun, "gun_agent");
        
        const config = getSnakeGameConfig();
        const profile = config.agentProfiles[AGENT_PROFILE.gun];
        assert.ok(profile, "gun agent profile should exist");
        assert.equal(profile.bodyPropId, "gun_ball");
        assert.equal(profile.faction, "gun");
        assert.deepEqual(profile.decision.scoreOrder, ["seek_enemy", "flee", "seek_food", "seek_ally", "explore"]);
        
        // Species check
        const species = SNAKE_GAME_SPECIES.get("gun_agent");
        assert.ok(species, "gun agent species should be registered");
        assert.equal(species.id, "gun_agent");
    });
    
    it("resolves correct relationships for gun agent", () => {
        applySnakeGameConfig();
        
        const snake = dummyInstance(AGENT_PROFILE.snake, { faction: "alpha" });
        const flee = dummyInstance(AGENT_PROFILE.flee, { faction: "bravo" });
        const gun = dummyInstance(AGENT_PROFILE.gun, { faction: "gun" });
        const squid = dummyInstance(AGENT_PROFILE.squid, { faction: "charlie" });
        
        // Gun agent targeting rules
        assert.equal(resolveRelationshipForInstances(gun, snake), "prey", "gun agent should target snake");
        assert.equal(resolveRelationshipForInstances(gun, flee), "neutral", "gun agent should ignore flee agent");
        assert.equal(resolveRelationshipForInstances(gun, squid), "neutral", "gun agent should ignore squid");
        assert.equal(resolveRelationshipForInstances(gun, gun), "ally", "gun agent same-faction should be ally");
        
        // Other agent relationships towards gun agent
        assert.equal(resolveRelationshipForInstances(flee, gun), "neutral", "flee agent should ignore gun agent");
        assert.equal(resolveRelationshipForInstances(snake, gun), "prey", "snake should treat gun agent as prey");
        assert.equal(resolveRelationshipForInstances(squid, gun), "neutral", "squid should treat gun agent as neutral");
    });
});
