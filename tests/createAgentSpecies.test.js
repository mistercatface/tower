import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { createAgentSpecies } from "../Libraries/Game/snake/species/createAgentSpecies.js";

describe("createAgentSpecies", () => {
    it("exports one species def per profile with shared lifecycle hooks", () => {
        applySnakeGameConfig();
        const snakeSpecies = createAgentSpecies(AGENT_PROFILE.snake);
        const fleeAgentSpecies = createAgentSpecies(AGENT_PROFILE.flee);
        const squidSpecies = createAgentSpecies(AGENT_PROFILE.squid);
        
        assert.equal(snakeSpecies.id, AGENT_PROFILE.snake);
        assert.equal(fleeAgentSpecies.id, AGENT_PROFILE.flee);
        assert.equal(squidSpecies.id, AGENT_PROFILE.squid);
        assert.equal(typeof snakeSpecies.createInstance, "function");
        assert.equal(typeof fleeAgentSpecies.die, "function");
        assert.equal(typeof squidSpecies.register, "function");
    });

    it("enables pressure diagnostics only for snake profile", () => {
        applySnakeGameConfig();
        assert.equal(createAgentSpecies(AGENT_PROFILE.snake).pressureDiagnostics, true);
        assert.equal(createAgentSpecies(AGENT_PROFILE.flee).pressureDiagnostics, false);
        assert.equal(createAgentSpecies(AGENT_PROFILE.squid).pressureDiagnostics, false);
    });
});
