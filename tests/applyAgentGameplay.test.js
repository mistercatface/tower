import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PROFILE, getAgentProfile } from "../Libraries/AI/agents/AgentProfiles.js";
import { applyAgentGameplay } from "./harness/agentTestCompat.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";

function mockProp({ isKinetic = false } = {}) {
    return { strategy: { groundNav: {}, isKinetic, friction: 0, density: 0 } };
}

describe("applyAgentGameplay", () => {
    it("snake leader reads gameplay.leader.maxSpeed override", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { gameplay: { leader: { maxSpeed: 95 } } } } });
        const head = mockProp();
        applyAgentGameplay(getAgentProfile(AGENT_PROFILE.snake).gameplay.leader, head);
        assert.equal(head.strategy.groundNav.maxSpeed, 95);
        applySnakeGameConfig();
    });

    it("flee leader applies maxSpeed and accel from gameplay.leader", () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { gameplay: { leader: { maxSpeed: 120, accel: 400 } } } } });
        const head = mockProp();
        applyAgentGameplay(getAgentProfile(AGENT_PROFILE.flee).gameplay.leader, head);
        assert.equal(head.strategy.groundNav.maxSpeed, 120);
        assert.equal(head.strategy.groundNav.accel, 400);
        applySnakeGameConfig();
    });

    it("applies distinct leader and body gameplay specs", () => {
        applySnakeGameConfig();
        const leader = mockProp();
        const body = mockProp({ isKinetic: true });
        const profile = getAgentProfile(AGENT_PROFILE.snake);
        applyAgentGameplay(profile.gameplay.leader, leader);
        applyAgentGameplay(profile.gameplay.body, body);
        assert.equal(leader.strategy.groundNav.maxSpeed, 250);
        assert.equal(body.strategy.friction, 2.25);
    });
});
