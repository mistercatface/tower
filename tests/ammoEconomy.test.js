import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { AgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { getObserverVisionFrame } from "../Libraries/Navigation/perception/observerVisionFrame.js";
import { getPropCategoryIndex } from "../GameState/SandboxWorldState.js";
import { buildAgentDecisionContextFor, scoreAgentIntentCandidates, AGENT_DECISION_PROFILE } from "../Libraries/AI/agents/gameDecisionContext.js";
import { WorldProp } from "../Entities/WorldProp.js";

const CELL = 16;
function ammoDecisionInput(input) {
    const shared = getSnakeGameConfig().shared;
    return { cellSize: CELL, shared, weaponVisionRange: shared.visionRange.range, ...input };
}

describe("AI ammo economy system", () => {
    it("initializes agent with configured starting ammo", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        
        assert.equal(fleeInstance.ammo, 10, "Default starting ammo should be 10");
    });

    it("decrements ammo on bullet fired, stops shooting, and transitions when empty", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        
        // Give it exactly 2 ammo to test depletion
        fleeInstance.ammo = 2;
        
        const snakePack = spawnSnakeChain(state, { col: 10, row: 5 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "alpha", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snakePack.chain.head.id, spawnGroupId: snakePack.chain.spawnGroupId });
        
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [{ col: 5, row: 5 }, { col: 10, row: 5 }],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 10 + 5 * state.obstacleGrid.cols]),
            }),
            isVisible: () => true,
        };
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        
        // Tick 1: Aiming (reacting)
        fleeInstance.autosim.tick(16);
        assert.equal(fleeInstance.intent.getMode(), "shoot_enemy");
        assert.equal(fleeInstance.ammo, 2, "Should not consume ammo before shooting");
        
        // Tick 2: Shoot first bullet
        fleeInstance.autosim.tick(150);
        assert.equal(fleeInstance.ammo, 1, "Ammo should decrement to 1");
        
        // Tick 3: Shoot second bullet
        fleeInstance.autosim.tick(150);
        assert.equal(fleeInstance.ammo, 0, "Ammo should decrement to 0");
        
        // Tick 4: Try to shoot but empty, should not shoot, and transition away
        fleeInstance.autosim.tick(150);
        assert.notEqual(fleeInstance.intent.getMode(), "shoot_enemy", "Should transition away from shoot mode when empty");
    });

    it("drops remaining ammo as shards on agent death", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        
        fleeInstance.ammo = 8;
        
        // Kill the agent
        fleeInstance.die(state);
        
        // Verify ammo shards are spawned in the world props
        const shards = state.worldProps.filter(p => p.type === "ammo_shard" && !p.isDead);
        assert.ok(shards.length > 0, "Ammo shards should be spawned upon death");
        
        const totalShardAmmo = shards.reduce((sum, s) => sum + (s.ammoValue ?? 0), 0);
        assert.equal(totalShardAmmo, 8, "Total shard ammo value must match the dead agent's ammo");
        
        // Verify they are registered in the ammo perception index
        const index = getPropCategoryIndex(state, "ammo");
        assert.ok(index.totalCount() > 0, "Ammo shards must be registered in the 'ammo' category index");
    });

    it("collects ammo shards and increments ammo count", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        
        fleeInstance.ammo = 3;
        
        // Spawn an ammo shard near the agent head
        const shard = new WorldProp(fleePack.head.x + 2, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 5;
        state.entityRegistry.add(shard);
        getPropCategoryIndex(state, "ammo").register(shard);
        
        // Call collection
        const collected = fleeInstance.collectAmmoTarget(state, shard);
        assert.ok(collected, "Should successfully collect the ammo shard");
        assert.equal(fleeInstance.ammo, 8, "Ammo should increase by the shard's value (3 + 5 = 8)");
        assert.ok(shard.isDead, "Shard prop should be marked dead after pickup");
    });

    it("increases seek_ammo utility score when ammo is low", async () => {
        applySnakeGameConfig();
        const enemy = { id: "enemy", x: 80, y: 0, type: "snake_head", isDead: false };
        const ammoProp = { id: "ammo_shard_1", x: 40, y: 0, type: "ammo_shard", isDead: false };
        
        // Simulate full ammo: seek_ammo should be absent or lower than combat
        const fullInstance = { ammo: 10 };
        const ctxFull = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, ammoDecisionInput({
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0, ammo: ammoProp },
            reachSteps: { threat: null, enemy: 4, ammo: 2, food: null, ally: null },
            foodFraction: 0.9,
            agent: { vx: 0, vy: 0, x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: null,
            agentInstance: fullInstance,
        }));
        
        const fullScores = scoreAgentIntentCandidates(AGENT_DECISION_PROFILE.flee, ctxFull);
        
        // Simulate low ammo: seek_ammo score should be higher
        const lowInstance = { ammo: 1 };
        const ctxLow = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, ammoDecisionInput({
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0, ammo: ammoProp },
            reachSteps: { threat: null, enemy: 4, ammo: 2, food: null, ally: null },
            foodFraction: 0.9,
            agent: { vx: 0, vy: 0, x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: null,
            agentInstance: lowInstance,
        }));
        
        const lowScores = scoreAgentIntentCandidates(AGENT_DECISION_PROFILE.flee, ctxLow);
        
        assert.ok(lowScores.seek_ammo > fullScores.seek_ammo, "Ammo utility score should increase when ammo is low");
    });
});
