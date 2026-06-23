import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { applyAgentGameplay } from "../Libraries/Game/snake/applyAgentGameplay.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";

function mockProp({ isKinetic = false } = {}) {
    return { strategy: { groundNav: {}, isKinetic, friction: 0, density: 0 } };
}

describe("applyAgentGameplay", () => {
    it("snake leader reads gameplay.leader.maxSpeed override", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { gameplay: { leader: { maxSpeed: 95 } } } } });
        const head = mockProp();
        applyAgentGameplay(AGENT_PROFILE.snake, head, "leader");
        assert.equal(head.strategy.groundNav.maxSpeed, 95);
        applySnakeGameConfig();
    });

    it("flee leader applies maxSpeed and accel from gameplay.leader", () => {
        applySnakeGameConfig({ agentProfiles: { flee_agent: { gameplay: { leader: { maxSpeed: 120, accel: 400 } } } } });
        const head = mockProp();
        applyAgentGameplay(AGENT_PROFILE.flee, head, "leader");
        assert.equal(head.strategy.groundNav.maxSpeed, 120);
        assert.equal(head.strategy.groundNav.accel, 400);
        applySnakeGameConfig();
    });

    it("squid body applies segment friction and density from gameplay.body", () => {
        applySnakeGameConfig();
        const segment = mockProp({ isKinetic: true });
        applyAgentGameplay(AGENT_PROFILE.squid, segment, "body");
        assert.equal(segment.strategy.friction, 2.5);
        assert.equal(segment.strategy.density, 0.001);
    });

    it("applyAgentGameplayForIndex picks leader vs body by index", () => {
        applySnakeGameConfig();
        const leader = mockProp();
        const body = mockProp({ isKinetic: true });
        applyAgentGameplay(AGENT_PROFILE.squid, leader, "leader");
        applyAgentGameplay(AGENT_PROFILE.squid, body, "body");
        assert.equal(leader.strategy.groundNav.maxSpeed, 180);
        assert.equal(body.strategy.friction, 2.5);
    });
});
