import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { getAgentIdentity, setAgentIdentity } from "../Libraries/AI/identity/agentIdentity.js";
import { createFleeMetabolism, getFleeHunger, setFleeHunger, tickFleeMetabolism } from "../Libraries/Game/snake/fleeAgent/fleeMetabolism.js";
import { deriveFleeSprintIntent } from "../Libraries/Game/snake/fleeAgent/fleeDecisionModel.js";
import { getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, spawnSnakeFoodShardAtCell, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";

function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}

loadPropAssets();

describe("flee agent metabolism", () => {
    it("pins hunger at zero instead of dying", () => {
        applySnakeGameConfig({ fleeAgent: { metabolism: { hungerDrainMs: 1000, foodValue: 0.5 } } });
        const metabolism = createFleeMetabolism();
        setFleeHunger(metabolism, 0.1);
        tickFleeMetabolism(metabolism, 500, 1);
        assert.equal(getFleeHunger(metabolism), 0);
        tickFleeMetabolism(metabolism, 500, 1);
        assert.equal(getFleeHunger(metabolism), 0);
    });

    it("sprint multiplies hunger drain", () => {
        applySnakeGameConfig({ fleeAgent: { metabolism: { hungerDrainMs: 1000, foodValue: 0.5 }, sprint: { hungerDrainMultiplier: 2 } } });
        const metabolism = createFleeMetabolism();
        setFleeHunger(metabolism, 1);
        tickFleeMetabolism(metabolism, 500, 2);
        assert.ok(getFleeHunger(metabolism) < 0.5);
    });

    it("refills hunger from shard pickup while seeking food", async () => {
        resetKineticConstraintIds(30);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { metabolism: { hungerDrainMs: 60_000, foodValue: 0.4 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.2);
        spawnSnakeFoodShardAtCell(state, { col: 10, row: 10 }, { foodValue: 0.4 });
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "seek_food");
        assert.ok(getFleeHunger(instance.metabolism) >= 0.6);
    });

    it("seeks visible food when hungry", async () => {
        resetKineticConstraintIds(32);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.2);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 });
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "seek_food");
        assert.equal(instance.intent.getTargetId(), food.id);
    });

    it("does not seek food hidden behind walls", async () => {
        resetKineticConstraintIds(33);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { initialHunger: 1 } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        for (let col = 11; col <= 17; col++) stampWall(state.obstacleGrid, col, 10);
        const food = spawnSnakeFoodShardAtCell(state, { col: 18, row: 10 });
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "explore");
        assert.ok(state.entityRegistry.getLive(food.id));
        assert.ok(getFleeHunger(instance.metabolism) > 0.99);
    });

    it("flee overrides seek_food when threat is severe", async () => {
        resetKineticConstraintIds(34);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { sprint: { fleeSeverity: 0.3 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.2);
        spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 });
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "seek_food");
        const mockSnakeId = "mock_snake_head";
        const mockSnake = { id: mockSnakeId, x: pack.head.x, y: pack.head.y + 24, type: "snake_head", isDead: false };
        state.entityRegistry.register("prop", mockSnake);
        snakeGame.registry.aliveByHeadId.set(mockSnakeId, { headId: mockSnakeId, species: "snake", lifecycle: "alive" });
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
    });

    it("turns red only while sprinting flee", async () => {
        resetKineticConstraintIds(31);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { sprint: { tint: "#ff3b30", fleeSeverity: 0.3 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        setAgentIdentity(pack.head.id, { name: "Bolt", color: "#7ad4ff" });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        assert.equal(getPropVisualTint(pack.head), "#7ad4ff");
        const mockSnakeId = "mock_snake_head";
        const mockSnake = { id: mockSnakeId, x: pack.head.x, y: pack.head.y + 24, type: "snake_head", isDead: false };
        state.entityRegistry.register("prop", mockSnake);
        snakeGame.registry.aliveByHeadId.set(mockSnakeId, { headId: mockSnakeId, species: "snake", lifecycle: "alive" });
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
        assert.equal(instance.sprinting, true);
        assert.equal(getPropVisualTint(pack.head), "#ff3b30");
        snakeGame.registry.aliveByHeadId.delete(mockSnakeId);
        state.entityRegistry.unregister(mockSnake);
        for (let i = 0; i < 80; i++) instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "explore");
        assert.equal(instance.sprinting, false);
        assert.equal(getPropVisualTint(pack.head), "#7ad4ff");
    });

    it("deriveFleeSprintIntent wants sprint on lethal flee", () => {
        applySnakeGameConfig({ fleeAgent: { sprint: { fleeSeverity: 0.5 } }, lethalThreatRange: 48 });
        const sprint = deriveFleeSprintIntent("flee", { lethal: true, severity: 1 });
        assert.equal(sprint.want, true);
        assert.equal(deriveFleeSprintIntent("explore", { lethal: true, severity: 1 }).want, false);
    });
});
