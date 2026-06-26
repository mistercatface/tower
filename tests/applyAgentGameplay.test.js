import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PROFILE, getAgentProfile } from "../Libraries/AI/agents/agentProfile.js";
import { applyAgentGameplay } from "../Libraries/Game/snake/applyAgentGameplay.js";
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

    it("squid body applies segment friction and density from gameplay.body", () => {
        applySnakeGameConfig();
        const segment = mockProp({ isKinetic: true });
        applyAgentGameplay(getAgentProfile(AGENT_PROFILE.squid).gameplay.body, segment);
        assert.equal(segment.strategy.friction, 2.5);
        assert.equal(segment.strategy.density, 0.001);
    });

    it("applies distinct leader and body gameplay specs", () => {
        applySnakeGameConfig();
        const leader = mockProp();
        const body = mockProp({ isKinetic: true });
        const profile = getAgentProfile(AGENT_PROFILE.squid);
        applyAgentGameplay(profile.gameplay.leader, leader);
        applyAgentGameplay(profile.gameplay.body, body);
        assert.equal(leader.strategy.groundNav.maxSpeed, 180);
        assert.equal(body.strategy.friction, 2.5);
    });
});
