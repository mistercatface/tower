import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { AgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { registerAgentInstance } from "./harness/agentTestCompat.js";
import { getObserverVisionFrame } from "../Libraries/Navigation/perception/observerVisionFrame.js";
import { getPropCategoryIndex } from "../GameState/SandboxWorldState.js";
import { buildAgentDecisionContextFor, scoreAgentIntentCandidates, AGENT_DECISION_PROFILE } from "../Libraries/AI/agents/AgentDecisionContext.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { addWorldPropToState } from "../GameState/EntityRegistry.js";
import { getCirclePropRadius } from "../Libraries/Props/propScale.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";

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
        fleeInstance.autosim.tick(16);
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
        addWorldPropToState(state, shard);
        getPropCategoryIndex(state, "ammo").register(shard);
        
        // Call collection
        const collected = fleeInstance.collectAmmoTarget(state, shard);
        assert.ok(collected, "Should successfully collect the ammo shard");
        assert.equal(fleeInstance.ammo, 8, "Ammo should increase by the shard's value (3 + 5 = 8)");
        assert.ok(shard.isDead, "Shard prop should be marked dead after pickup");
    });

    it("collects a wide ammo shard whose body extends past eatRadius", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        fleeInstance.ammo = 0;

        const shard = new WorldProp(fleePack.head.x, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 4;
        addWorldPropToState(state, shard);
        getPropCategoryIndex(state, "ammo").register(shard);
        shard.shape = new CircleShape(5);
        const shardRadius = getCirclePropRadius(shard);
        assert.equal(shardRadius, 5, "ammo shard should report its body radius");
        shard.x = fleePack.head.x + fleeInstance.eatRadius + shardRadius - 0.5;

        const collected = fleeInstance.collectAmmoTarget(state, shard);
        assert.ok(collected, "Wide ammo shard touching the agent should be collected");
        assert.equal(fleeInstance.ammo, 4);
    });

    it("does not collect an ammo shard that is not touching", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        fleeInstance.ammo = 0;

        const shard = new WorldProp(fleePack.head.x, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 4;
        addWorldPropToState(state, shard);
        getPropCategoryIndex(state, "ammo").register(shard);
        shard.shape = new CircleShape(5);
        shard.x = fleePack.head.x + fleeInstance.eatRadius + getCirclePropRadius(shard) + 6;

        const collected = fleeInstance.collectAmmoTarget(state, shard);
        assert.equal(collected, false, "Ammo shard out of reach should not be collected");
        assert.equal(fleeInstance.ammo, 0);
    });

    it("consumes committed ammo target when reach is zero", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        fleeInstance.ammo = 0;

        const shard = new WorldProp(fleePack.head.x + 2, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 4;
        addWorldPropToState(state, shard);
        getPropCategoryIndex(state, "ammo").register(shard);

        const decisionCtx = { reachSteps: { ammo: 0 }, routeStatus: { destReached: false } };
        const collected = fleeInstance.tryConsumeCommittedTarget(state, "seek_ammo", shard, decisionCtx);
        assert.ok(collected, "Committed ammo target should be consumed at zero reach");
        assert.equal(fleeInstance.ammo, 4);
    });

    it("does not consume committed ammo target when reach is too far", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        fleeInstance.ammo = 0;

        const shard = new WorldProp(fleePack.head.x + 2, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 4;
        addWorldPropToState(state, shard);
        getPropCategoryIndex(state, "ammo").register(shard);

        const decisionCtx = { reachSteps: { ammo: 3 }, routeStatus: { destReached: false } };
        const collected = fleeInstance.tryConsumeCommittedTarget(state, "seek_ammo", shard, decisionCtx);
        assert.equal(collected, false, "Ammo target should not be consumed when reach exceeds threshold");
        assert.equal(fleeInstance.ammo, 0);
    });

    it("consumes committed food and ammo through the same consumable path", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        fleeInstance.ammo = 0;

        const food = new WorldProp(fleePack.head.x, fleePack.head.y, "snake_shard", 0);
        food.snakeFoodValue = 0.2;
        addWorldPropToState(state, food);
        getPropCategoryIndex(state, "food").register(food);

        const ammo = new WorldProp(fleePack.head.x + 2, fleePack.head.y, "ammo_shard", 0);
        ammo.ammoValue = 2;
        addWorldPropToState(state, ammo);
        getPropCategoryIndex(state, "ammo").register(ammo);

        const atReach = { reachSteps: { food: 0, ammo: 0 }, routeStatus: { destReached: false } };
        assert.ok(fleeInstance.tryConsumeCommittedTarget(state, "seek_food", food, atReach));
        assert.ok(fleeInstance.tryConsumeCommittedTarget(state, "seek_ammo", ammo, atReach));
        assert.equal(fleeInstance.ammo, 2);
    });

    it("does not consume non-consumable committed modes", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();

        const enemy = { id: "enemy", x: fleePack.head.x, y: fleePack.head.y, type: "snake_head", isDead: false };
        const atReach = { reachSteps: { enemy: 0 }, routeStatus: { destReached: true } };
        const consumed = fleeInstance.tryConsumeCommittedTarget(state, "seek_enemy", enemy, atReach);
        assert.equal(consumed, false, "Non-consumable modes should not trigger pickup");
    });

    it("consumes a wide ammo shard at zero reach via committed target path", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        fleeInstance.ammo = 0;

        const shard = new WorldProp(fleePack.head.x, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 4;
        addWorldPropToState(state, shard);
        getPropCategoryIndex(state, "ammo").register(shard);
        shard.shape = new CircleShape(5);
        shard.x = fleePack.head.x + fleeInstance.eatRadius + getCirclePropRadius(shard) - 0.5;

        const decisionCtx = { reachSteps: { ammo: 0 }, routeStatus: { destReached: false } };
        const collected = fleeInstance.tryConsumeCommittedTarget(state, "seek_ammo", shard, decisionCtx);
        assert.ok(collected, "Wide shard touching the agent should be consumed at zero reach");
        assert.equal(fleeInstance.ammo, 4);
    });

    it("consumes committed ammo target when destination is reached", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);

        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        fleeInstance.ammo = 0;

        const shard = new WorldProp(fleePack.head.x + fleeInstance.eatRadius + 6, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 3;
        addWorldPropToState(state, shard);
        getPropCategoryIndex(state, "ammo").register(shard);
        shard.x = fleePack.head.x + 2;

        const decisionCtx = { reachSteps: { ammo: 4 }, routeStatus: { destReached: true } };
        const collected = fleeInstance.tryConsumeCommittedTarget(state, "seek_ammo", shard, decisionCtx);
        assert.ok(collected, "Destination reached should allow pickup even when flow reach is stale");
        assert.equal(fleeInstance.ammo, 3);
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
            instance: fullInstance,
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
            instance: lowInstance,
        }));
        
        const lowScores = scoreAgentIntentCandidates(AGENT_DECISION_PROFILE.flee, ctxLow);
        
        assert.ok(lowScores.seek_ammo > fullScores.seek_ammo, "Ammo utility score should increase when ammo is low");
    });

    it("forces out-of-ammo agent to treat visible enemy as threat and flee", async () => {
        applySnakeGameConfig();
        const enemy = { id: "enemy", x: 80, y: 0, type: "snake_head", isDead: false };
        const emptyInstance = { ammo: 0 };
        const ctxEmpty = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, ammoDecisionInput({
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0, ammo: null },
            reachSteps: { threat: null, enemy: 5, ammo: null, food: null, ally: null },
            foodFraction: 0.9,
            agent: { vx: 0, vy: 0, x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: null,
            instance: emptyInstance,
        }));
        
        const scores = scoreAgentIntentCandidates(AGENT_DECISION_PROFILE.flee, ctxEmpty);
        
        assert.ok(ctxEmpty.known.threat !== null, "Enemy should be treated as a threat when out of ammo");
        assert.ok(scores.flee > scores.shoot_enemy, "Flee score should be higher than shoot_enemy score");
        assert.ok(scores.flee > scores.seek_enemy, "Flee score should be higher than seek_enemy score");
    });

    it("scores seek_ammo under non-lethal threat when out of ammo", async () => {
        applySnakeGameConfig();
        const enemy = { id: "enemy", x: 80, y: 0, type: "snake_head", isDead: false };
        const ammoProp = { id: "ammo_shard_1", x: 40, y: 0, type: "ammo_shard", isDead: false };
        const emptyInstance = { ammo: 0 };
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, ammoDecisionInput({
            visibleWorld: { threat: null, prey: enemy, food: null, ally: null, allyCount: 0, threatCount: 0, ammo: ammoProp },
            reachSteps: { threat: 5, enemy: 5, ammo: 2, food: null, ally: null },
            foodFraction: 0.85,
            agent: { id: "flee1", vx: 0, vy: 0, x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: null,
            instance: emptyInstance,
        }));

        const scores = scoreAgentIntentCandidates(AGENT_DECISION_PROFILE.flee, ctx);

        assert.ok(ctx.known.threat !== null, "Enemy should still be treated as a threat when out of ammo");
        assert.ok(Number.isFinite(scores.seek_ammo), "seek_ammo should score under threat when resupply is needed");
        assert.ok(scores.seek_ammo > -Infinity, "seek_ammo should not be guard-blocked under threat");
    });

    it("prefers seek_ammo over seek_food when empty and both are visible under threat", async () => {
        applySnakeGameConfig();
        const enemy = { id: "enemy", x: 80, y: 0, type: "snake_head", isDead: false };
        const ammoProp = { id: "ammo_shard_1", x: 32, y: 0, type: "ammo_shard", isDead: false };
        const foodProp = { id: "food_1", x: 32, y: 0, type: "snake_shard", isDead: false };
        const emptyInstance = { ammo: 0 };
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, ammoDecisionInput({
            visibleWorld: { threat: null, prey: enemy, food: foodProp, ally: null, allyCount: 0, threatCount: 0, ammo: ammoProp },
            reachSteps: { threat: 5, enemy: 5, ammo: 2, food: 2, ally: null },
            foodFraction: 0.5,
            agent: { id: "flee1", vx: 0, vy: 0, x: 0, y: 0 },
            state: { obstacleGrid: { cols: 64, worldCol: () => 0, worldRow: () => 0 }, nav: { observerVisionFrame: { ensureHeadVision: () => ({ cellSet: new Set([0]) }), isVisible: () => true } } },
            actionState: null,
            instance: emptyInstance,
        }));

        const scores = scoreAgentIntentCandidates(AGENT_DECISION_PROFILE.flee, ctx);

        assert.ok(Number.isFinite(scores.seek_ammo) && Number.isFinite(scores.seek_food), "Both seek_ammo and seek_food should score under threat");
        assert.ok(scores.seek_ammo > scores.seek_food, "Empty ammo should make resupply beat food at equal reach");
    });

    it("flee agent seeks and collects ammo when out of ammo", async () => {
        applySnakeGameConfig();
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        
        const fleePack = spawnGameAgentChain(state, { col: 5, row: 5 }, "flee_agent");
        const fleeInstance = new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start();
        
        fleeInstance.ammo = 0;
        
        const shard = new WorldProp(fleePack.head.x + 32, fleePack.head.y, "ammo_shard", 0);
        shard.ammoValue = 5;
        getPropCategoryIndex(state, "ammo").register(shard);
        state.worldProps.push(shard);
        
        state.nav.observerVisionFrame = {
            ensureHeadVision: () => ({
                cells: [5 + 5 * state.obstacleGrid.cols, 7 + 5 * state.obstacleGrid.cols],
                cellSet: new Set([5 + 5 * state.obstacleGrid.cols, 7 + 5 * state.obstacleGrid.cols]),
            }),
            isVisible: () => true,
            navTopology: { grid: { cols: state.obstacleGrid.cols } }
        };
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().shared.visionRange);
        
        fleeInstance.autosim.tick(16);
        assert.equal(fleeInstance.intent.getMode(), "seek_ammo", "Should seek ammo when empty and shard is visible");
        assert.ok(fleeInstance.intent.context.target === shard, "Should target the ammo shard directly in FSM context");
        
        fleePack.head.x = shard.x;
        fleePack.head.y = shard.y;
        
        fleeInstance.autosim.tick(16);
        assert.equal(fleeInstance.ammo, 5, "Ammo count should increase by the shard value");
    });
});
