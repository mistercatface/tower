import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { applyAgentGameplay, applyAgentGameplayForIndex } from "../Libraries/Game/snake/applyAgentGameplay.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";

function mockProp({ isKinetic = false } = {}) {
    return { strategy: { groundNav: {}, isKinetic, friction: 0, density: 0 } };
}

describe("applyAgentGameplay", () => {
    it("snake leader reads legacy headMaxSpeed override", () => {
        applySnakeGameConfig({ headMaxSpeed: 95 });
        const head = mockProp();
        applyAgentGameplay(AGENT_PROFILE.snake, head, "leader");
        assert.equal(head.strategy.groundNav.maxSpeed, 95);
        assert.equal(head._brainSyncPass, 0);
        applySnakeGameConfig();
    });

    it("flee leader applies maxSpeed and accel from profile", () => {
        applySnakeGameConfig({ fleeAgent: { maxSpeed: 120, accel: 400 } });
        const head = mockProp();
        applyAgentGameplay(AGENT_PROFILE.flee, head, "leader");
        assert.equal(head.strategy.groundNav.maxSpeed, 120);
        assert.equal(head.strategy.groundNav.accel, 400);
        applySnakeGameConfig();
    });

    it("squid body applies segment friction and density", () => {
        applySnakeGameConfig();
        const segment = mockProp({ isKinetic: true });
        applyAgentGameplay(AGENT_PROFILE.squid, segment, "body");
        const squid = getSnakeGameConfig().agentProfiles.squid;
        assert.equal(segment.strategy.friction, squid.segmentFriction ?? squid.gameplay.body.friction);
        assert.equal(segment.strategy.density, squid.segmentDensity ?? squid.gameplay.body.density);
    });

    it("applyAgentGameplayForIndex picks leader vs body by index", () => {
        applySnakeGameConfig();
        const leader = mockProp();
        const body = mockProp({ isKinetic: true });
        applyAgentGameplayForIndex(AGENT_PROFILE.squid, leader, 1, 1);
        applyAgentGameplayForIndex(AGENT_PROFILE.squid, body, 0, 1);
        const squid = getSnakeGameConfig().agentProfiles.squid;
        assert.equal(leader.strategy.groundNav.maxSpeed, squid.brainMaxSpeed ?? squid.gameplay.leader.maxSpeed);
        assert.equal(body.strategy.friction, squid.segmentFriction ?? squid.gameplay.body.friction);
    });
});
