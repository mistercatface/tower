import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds, resolveChainLinkRestLength } from "../Libraries/Sandbox/chainLinks.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getCirclePropRadius, getPolygonPropBoundingRadius } from "../Libraries/Props/propScale.js";
import { spawnFleeAgent, resolveFleeAgentForwardDir } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { syncFleeAgentWedgeFacing, fleeAgentWedgeFacingFromHeading } from "../Libraries/Game/snake/fleeAgent/syncFleeAgentWedgeFacing.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";

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
        snakeGame.registry.instancesByHeadId.set(pack.head.id, instance);
        snakeGame.registry.aliveByHeadId.set(pack.head.id, { headId: pack.head.id, species: "flee_agent", lifecycle: "alive" });

        instance.start(state);
        assert.equal(instance.mode, "explore");

        // Tick once to pick an explore destination
        instance.tick(state, 16);
        assert.ok(instance.locomotion.getDestination());

        // Now spawn a snake nearby (e.g., at col 10, row 12)
        const snakeHead = state.entityRegistry.getLive(state.worldProps[0]?.id); // Let's just mock a snake head
        const mockSnakeId = "mock_snake_head";
        const mockSnake = { id: mockSnakeId, x: pack.head.x, y: pack.head.y + 32, type: "snake_head", isDead: false };
        state.entityRegistry.register("prop", mockSnake);
        snakeGame.registry.aliveByHeadId.set(mockSnakeId, { headId: mockSnakeId, species: "snake", lifecycle: "alive" });

        // Tick again; the flee agent should perceive the snake as a threat and transition to flee mode
        instance.tick(state, 16);
        assert.equal(instance.mode, "flee");
        assert.ok(instance.fleeTicks > 0);
    });
});
