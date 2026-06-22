import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds, resolveChainLinkRestLength } from "../Libraries/Sandbox/chainLinks.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { getCirclePropRadius, getPolygonPropBoundingRadius } from "../Libraries/Props/propScale.js";
import { spawnFleeAgent, resolveFleeAgentForwardDir } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { syncFleeAgentWedgeFacing, fleeAgentWedgeFacingFromHeading } from "../Libraries/Game/snake/fleeAgent/syncFleeAgentWedgeFacing.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "../Libraries/Game/snake/snakeCombat.js";
loadPropAssets();
describe("flee agent spawn", () => {
    it("spawns a tri wedge head linked to a ball body with chain head on the wedge", async () => {
        applySnakeGameConfig({ startRadius: 2 });
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const config = getSnakeGameConfig();
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        assert.equal(pack.members.length, 2);
        assert.equal(pack.head.type, "flee_wedge");
        assert.equal(pack.body.type, "ball");
        assert.ok(pack.head.strategy?.canChain);
        assert.deepEqual(getOrderedChainMemberIds(state, pack.head.id), [pack.head.id, pack.body.id]);
        assert.equal(state.kinetic.kineticConstraints.length, 1);
        assert.equal(state.kinetic.kineticConstraints[0].restLength, resolveChainLinkRestLength(pack.head, pack.body, config.linkSlack));
    });
    it("places the ball body behind the wedge along the forward axis", async () => {
        applySnakeGameConfig({ startRadius: 2, growDirX: -1, growDirY: 0 });
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const config = getSnakeGameConfig();
        const forward = resolveFleeAgentForwardDir(config);
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const dx = pack.head.x - pack.body.x;
        const dy = pack.head.y - pack.body.y;
        const dist = Math.hypot(dx, dy);
        assert.ok(Math.abs(dx / dist - forward.x) < 0.01);
        assert.ok(Math.abs(dy / dist - forward.y) < 0.01);
        assert.ok(Math.abs(dist - resolveChainLinkRestLength(pack.head, pack.body, config.linkSlack)) < 0.01);
    });
    it("scales the flee wedge to the body radius", async () => {
        applySnakeGameConfig({ startRadius: 2 });
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        assert.equal(getCirclePropRadius(pack.body), 2);
        assert.ok(Math.abs(getPolygonPropBoundingRadius(pack.head) - 2) < 0.05);
        assert.ok(pack.head.height < 12);
    });
    it("syncs wedge facing to its own velocity heading", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(5);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        pack.head.vx = 40;
        pack.head.vy = 0;
        syncFleeAgentWedgeFacing(pack.head, pack.head);
        assert.ok(Math.abs(pack.head.facing - fleeAgentWedgeFacingFromHeading(0)) < 1e-4);
        pack.head.vx = 0;
        pack.head.vy = 30;
        syncFleeAgentWedgeFacing(pack.head, pack.head);
        assert.ok(Math.abs(pack.head.facing - fleeAgentWedgeFacingFromHeading(Math.PI / 2)) < 1e-4);
    });
    it("starts, ticks, and flees from a visible snake threat", async () => {
        applySnakeGameConfig({ startRadius: 2 });
        resetKineticConstraintIds(6);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        // Spawn a flee agent
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, wedgeId: pack.body.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        assert.equal(instance.intent.getMode(), "explore");
        instance.tick(state, 16);
        assert.ok(instance.intent.getDestination());
        // Now spawn a snake nearby (e.g., at col 10, row 12)
        const snakeHead = state.entityRegistry.getLive(state.worldProps[0]?.id); // Let's just mock a snake head
        const mockSnakeId = "mock_snake_head";
        const mockSnake = { id: mockSnakeId, x: pack.head.x, y: pack.head.y + 32, type: "snake_head", isDead: false };
        state.entityRegistry.register("prop", mockSnake);
        snakeGame.registry.aliveByHeadId.set(mockSnakeId, { headId: mockSnakeId, species: "snake", lifecycle: "alive" });
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
    });
    it("shatters flee agent on predator snake head ram", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30 });
        resetKineticConstraintIds(7);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        // Spawn a flee agent
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, wedgeId: pack.body.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        // Spawn a predator snake chain
        const predator = spawnSnakeChain(state, { col: 8, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId });
        snakeGame.registry.aliveByHeadId.set(predator.chain.head.id, { headId: predator.chain.head.id, species: "snake", lifecycle: "alive" });
        // Set faction explicitly on predator head
        predator.chain.head.faction = "snake";
        // Position predator head to ram the flee agent's body
        const predatorHead = predator.chain.head;
        const preyBody = pack.body;
        predatorHead.vx = 80;
        predatorHead.vy = 0;
        preyBody.vx = -10;
        preyBody.vy = 0;
        predatorHead.x = preyBody.x - predatorHead.radius - preyBody.radius + 2;
        predatorHead.y = preyBody.y;
        const props = [...predator.chain.members, ...pack.members];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, snakeGame);
        assert.equal(instance.lifecycle, "dead");
        assert.ok(snakeGame.registry.deadHeadIds.has(pack.head.id));
        // Verify that the body segment was removed from the entity registry (shattered)
        assert.equal(state.entityRegistry.getLive(pack.body.id), null);
    });
});
