import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { createAgentSpecies, snakeSpecies, fleeAgentSpecies, squidSpecies } from "../Libraries/Game/snake/species/createAgentSpecies.js";

describe("createAgentSpecies", () => {
    it("exports one species def per profile with shared lifecycle hooks", () => {
        applySnakeGameConfig();
        assert.equal(snakeSpecies.id, AGENT_PROFILE.snake);
        assert.equal(fleeAgentSpecies.id, AGENT_PROFILE.flee);
        assert.equal(squidSpecies.id, AGENT_PROFILE.squid);
        assert.equal(typeof snakeSpecies.createInstance, "function");
        assert.equal(typeof fleeAgentSpecies.die, "function");
        assert.equal(typeof squidSpecies.syncMembers, "function");
    });

    it("enables pressure diagnostics only for snake profile", () => {
        applySnakeGameConfig();
        assert.equal(typeof createAgentSpecies(AGENT_PROFILE.snake).updateDiagnostics, "function");
        assert.equal(createAgentSpecies(AGENT_PROFILE.flee).updateDiagnostics, undefined);
        assert.equal(createAgentSpecies(AGENT_PROFILE.squid).updateDiagnostics, undefined);
    });
});
