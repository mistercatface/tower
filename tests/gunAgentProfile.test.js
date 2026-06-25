import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { resolveRelationshipForInstances } from "../Libraries/Game/snake/agentRelationships.js";
import { SNAKE_GAME_SPECIES } from "../Libraries/Game/snake/species/index.js";
import { buildAgentDecisionContextFor, AGENT_DECISION_PROFILE } from "../Libraries/AI/agents/gameDecisionContext.js";
import { createRangedCombatActionState } from "../Libraries/Game/snake/rangedCombat.js";
function dummyInstance(profileId, { faction = "a", segments = 1 } = {}) {
    return { profileId, head: { faction }, memberIds: Array.from({ length: segments }, (_, i) => i) };
}
function mockTarget(id, x = 80, y = 0) {
    return { id, x, y, type: "snake_head", isDead: false };
}
describe("gun agent profile and species", () => {
    it("registers gun agent profile and matches config rules", () => {
        applySnakeGameConfig();
        assert.equal(AGENT_PROFILE.gun, "gun_agent");
        const config = getSnakeGameConfig();
        const profile = config.agentProfiles[AGENT_PROFILE.gun];
        assert.ok(profile, "gun agent profile should exist");
        assert.equal(profile.bodyPropId, "boid_triangle");
        assert.equal(profile.faction, "gun");
        assert.deepEqual(profile.decision.scoreOrder, ["flee", "shoot_enemy", "seek_enemy", "seek_food", "seek_ally", "explore"]);
        assert.equal(profile.relationships.snake.type, "proximity");
        const species = SNAKE_GAME_SPECIES.get("gun_agent");
        assert.ok(species, "gun agent species should be registered");
        assert.equal(species.id, "gun_agent");
    });
    it("resolves proximity relationships for gun agent", () => {
        applySnakeGameConfig();
        const config = getSnakeGameConfig();
        const snake = dummyInstance(AGENT_PROFILE.snake, { faction: "alpha", segments: 3 });
        const flee = dummyInstance(AGENT_PROFILE.flee, { faction: "bravo" });
        const gun = dummyInstance(AGENT_PROFILE.gun, { faction: "gun" });
        const squid = dummyInstance(AGENT_PROFILE.squid, { faction: "charlie" });
        assert.equal(resolveRelationshipForInstances(gun, snake, config, 40 * 40), "threat", "near snake should threaten gun agent");
        assert.equal(resolveRelationshipForInstances(gun, snake, config, 100 * 100), "prey", "far snake should remain prey");
        assert.equal(resolveRelationshipForInstances(gun, flee), "neutral", "gun agent should ignore flee agent");
        assert.equal(resolveRelationshipForInstances(gun, squid), "neutral", "gun agent should ignore squid");
        assert.equal(resolveRelationshipForInstances(gun, gun), "ally", "gun agent same-faction should be ally");
        assert.equal(resolveRelationshipForInstances(flee, gun), "neutral", "flee agent should ignore gun agent");
        assert.equal(resolveRelationshipForInstances(snake, gun), "prey", "snake should treat gun agent as prey");
        assert.equal(resolveRelationshipForInstances(squid, gun), "neutral", "squid should treat gun agent as neutral");
    });
    it("chooses shoot_enemy for a visible far enemy with line of sight", () => {
        applySnakeGameConfig();
        const enemy = mockTarget("snake1");
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.gun, {
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0 },
            reachSteps: { threat: null, enemy: 4, food: null, ally: null },
            foodFraction: 0.9,
            agent: { x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: createRangedCombatActionState(),
        });
        assert.equal(ctx.chosenIntent.mode, "shoot_enemy");
        assert.equal(ctx.chosenIntent.targetId, "snake1");
        assert.equal(ctx.combatState.canShoot, true);
    });
    it("chooses seek_enemy when enemy is known but not shootable", () => {
        applySnakeGameConfig();
        const enemy = mockTarget("snake1");
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.gun, {
            visibleWorld: { threat: null, prey: null, food: null, ally: null, allyCount: 0, threatCount: 0 },
            memoryWorld: { prey: enemy },
            memorySource: { prey: true },
            reachSteps: { threat: null, enemy: 8, food: null, ally: null },
            foodFraction: 0.9,
            agent: { x: 0, y: 0 },
            state: null,
            actionState: createRangedCombatActionState(),
        });
        assert.equal(ctx.chosenIntent.mode, "seek_enemy");
        assert.equal(ctx.chosenIntent.targetId, "snake1");
    });
    it("chooses flee when a close snake is visible as threat", () => {
        applySnakeGameConfig();
        const threat = mockTarget("snake1", 16, 0);
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.gun, {
            visibleWorld: { threat, prey: null, food: null, ally: null, allyCount: 1, threatCount: 1 },
            reachSteps: { threat: 1, enemy: null, food: null, ally: null },
            foodFraction: 0.9,
            agent: { x: 0, y: 0 },
            state: null,
            actionState: createRangedCombatActionState(),
        });
        assert.equal(ctx.chosenIntent.mode, "flee");
        assert.equal(ctx.sprintIntent.want, true);
    });
});
