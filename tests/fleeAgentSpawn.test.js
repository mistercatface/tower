import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { getCirclePropRadius } from "../Libraries/Props/propScale.js";
import { resolveFleeAgentForwardDir, spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "../Libraries/Game/snake/snakeCombat.js";
import { applyGroundRollDrive, steerRollToward } from "../Libraries/Sandbox/kineticRollActuator.js";
loadPropAssets();
describe("flee agent spawn", () => {
    it("spawns one flee_ball with chain head", async () => {
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        assert.equal(pack.members.length, 1);
        assert.equal(pack.head.type, "flee_ball");
        assert.equal(pack.head.shape.type, "Circle");
        assert.ok(pack.head.strategy?.canChain);
        assert.deepEqual(getOrderedChainMemberIds(state, pack.head.id), [pack.head.id]);
        assert.equal(state.kinetic.kineticConstraints.length, 0);
    });

    it("initializes turretFacing to flee forward", async () => {
        resetKineticConstraintIds(5);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, growDirX: -1, growDirY: 0 });
        const forward = resolveFleeAgentForwardDir();
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        assert.ok(Math.abs(pack.head.turretFacing - Math.atan2(forward.y, forward.x)) < 1e-4);
    });

    it("slews turret toward roll thrust before speed builds", async () => {
        resetKineticConstraintIds(7);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        pack.head.turretFacing = 0;
        pack.head.vx = 0;
        pack.head.vy = 0;
        steerRollToward(pack.head, 0, 1, { accel: 600, maxSpeed: 180 });
        assert.ok(Math.abs(pack.head.turretFacing - Math.PI / 2) < 0.35);
    });

    it("slews turret toward velocity while fleeing ticks", async () => {
        resetKineticConstraintIds(6);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        pack.head.vx = 40;
        pack.head.vy = 20;
        const heading = Math.atan2(pack.head.vy, pack.head.vx);
        pack.head.facing = heading;
        pack.head.turretFacing = 0;
        steerRollToward(pack.head, pack.head.vx, pack.head.vy, { accel: 600, maxSpeed: 180 }, state);
        for (let i = 0; i < 12; i++) {
            applyGroundRollDrive(pack.head, 1 / 60, state);
            instance.tick(state, 16);
        }
        assert.ok(Math.abs(pack.head.turretFacing - heading) < 0.2);
    });

    it("applies fleeAgent roll speed from snake config", async () => {
        resetKineticConstraintIds(9);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { maxSpeed: 120, accel: 400 } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        assert.equal(pack.head.strategy.groundNav.maxSpeed, 120);
        assert.equal(pack.head.strategy.groundNav.accel, 400);
        assert.equal(pack.head.type, "flee_ball");
    });

    it("scales ball radius to snake start radius", async () => {
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        assert.equal(getCirclePropRadius(pack.head), 2);
        assert.equal(pack.head.radius, 2);
    });
    it("starts, ticks, and flees from a visible snake threat", async () => {
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        assert.equal(instance.intent.getMode(), "explore");
        instance.tick(state, 16);
        assert.ok(instance.intent.getDestination());
        const mockSnakeId = "mock_snake_head";
        const mockSnake = { id: mockSnakeId, x: pack.head.x, y: pack.head.y + 32, type: "snake_head", isDead: false };
        state.entityRegistry.register("prop", mockSnake);
        snakeGame.registry.aliveByHeadId.set(mockSnakeId, { headId: mockSnakeId, species: "snake", lifecycle: "alive" });
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
    });
    it("shatters flee agent on predator snake head ram", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30 });
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        applySnakeGameConfig({ splitImpulseThreshold: 30, growDirX: 1 });
        const predator = spawnSnakeChain(state, { col: 12, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        applySnakeGameConfig({ splitImpulseThreshold: 30, growDirX: -1 });
        registerSnakeTestInstance(state, snakeGame, { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId });
        snakeGame.registry.aliveByHeadId.set(predator.chain.head.id, { headId: predator.chain.head.id, species: "snake", lifecycle: "alive" });
        predator.chain.head.faction = "snake";
        const predatorHead = predator.chain.head;
        const prey = pack.head;
        predatorHead.vx = -80;
        predatorHead.vy = 0;
        prey.vx = 10;
        prey.vy = 0;
        predatorHead.x = prey.x + prey.radius + predatorHead.radius - 2;
        predatorHead.y = prey.y;
        const props = [...predator.chain.members, prey];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, snakeGame);
        assert.equal(instance.lifecycle, "dead");
        assert.ok(snakeGame.registry.deadHeadIds.has(pack.head.id));
        assert.equal(state.entityRegistry.getLive(pack.head.id), null);
    });
});
