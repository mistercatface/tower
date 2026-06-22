import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { getAgentIdentity, setAgentIdentity } from "../Libraries/AI/identity/agentIdentity.js";
import { createFleeMetabolism, feedFleeMetabolism, getFleeHunger, setFleeHunger, tickFleeMetabolism } from "../Libraries/Game/snake/fleeAgent/fleeMetabolism.js";
import { deriveFleeSprintIntent } from "../Libraries/Game/snake/fleeAgent/fleeDecisionModel.js";

loadPropAssets();

describe("flee agent metabolism", () => {
    it("drains hunger over time and dies after starve interval", () => {
        applySnakeGameConfig({ fleeAgent: { metabolism: { hungerDrainMs: 1000, foodValue: 0.5, starveDeathIntervalMs: 500 } } });
        const metabolism = createFleeMetabolism();
        setFleeHunger(metabolism, 0);
        assert.equal(tickFleeMetabolism(metabolism, 400, 1), false);
        assert.equal(tickFleeMetabolism(metabolism, 200, 1), true);
    });

    it("sprint multiplies hunger drain", () => {
        applySnakeGameConfig({ fleeAgent: { metabolism: { hungerDrainMs: 1000, foodValue: 0.5, starveDeathIntervalMs: 5000 }, sprint: { hungerDrainMultiplier: 2 } } });
        const metabolism = createFleeMetabolism();
        setFleeHunger(metabolism, 1);
        tickFleeMetabolism(metabolism, 500, 2);
        assert.ok(getFleeHunger(metabolism) < 0.5);
    });

    it("refills hunger from shard pickup", async () => {
        resetKineticConstraintIds(30);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { metabolism: { hungerDrainMs: 60_000, foodValue: 0.4, starveDeathIntervalMs: 10_000 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.2);
        spawnSnakeFoodShardAtCell(state, { col: 10, row: 10 }, { foodValue: 0.4 });
        instance.tick(state, 16);
        assert.ok(getFleeHunger(instance.metabolism) >= 0.6);
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
