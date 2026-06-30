import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { createAgentSpecies } from "./harness/agentTestCompat.js";

describe("createAgentSpecies", () => {
    it("exports one species def per profile with shared lifecycle hooks", () => {
        applySnakeGameConfig();
        const snakeSpecies = createAgentSpecies(AGENT_PROFILE.snake);
        const fleeAgentSpecies = createAgentSpecies(AGENT_PROFILE.flee);
        
        assert.equal(snakeSpecies.id, AGENT_PROFILE.snake);
        assert.equal(fleeAgentSpecies.id, AGENT_PROFILE.flee);
        assert.equal(typeof snakeSpecies.createInstance, "function");
        assert.equal(typeof fleeAgentSpecies.die, "function");
    });

    it("enables pressure diagnostics only for snake profile", () => {
        applySnakeGameConfig();
        assert.equal(createAgentSpecies(AGENT_PROFILE.snake).pressureDiagnostics, true);
        assert.equal(createAgentSpecies(AGENT_PROFILE.flee).pressureDiagnostics, false);
    });
});
