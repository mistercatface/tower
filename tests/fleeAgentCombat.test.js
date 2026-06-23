import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "../Libraries/Game/snake/snakeCombat.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";

function registerFleeCombatAgent(state, snakeGame, cell, faction) {
    const pack = spawnFleeAgent(state, cell, { faction });
    const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
    registerAgentInstance(snakeGame, "flee_agent", instance);
    return { pack, instance };
}

function resolveFleeHeadCollision(state, snakeGame, left, right, { leftVx = 80, leftVy = 0, rightVx = -80, rightVy = 0 } = {}) {
    const leftHead = left.pack.head;
    const rightHead = right.pack.head;
    leftHead.vx = leftVx;
    leftHead.vy = leftVy;
    rightHead.vx = rightVx;
    rightHead.vy = rightVy;
    leftHead.x = rightHead.x - leftHead.radius - rightHead.radius + 2;
    leftHead.y = rightHead.y;
    const tick = attachKineticTestTickFromState(state, [leftHead, rightHead], 50);
    const pairs = gatherKineticContactPairs(tick);
    resolveKineticContactPassWithPairs(tick, pairs);
    applyKineticContactSideEffects(tick, kineticContactBuffer);
    resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, snakeGame);
}

describe("flee agent escape combat", () => {
    it("sprinting flee outside flee mode does not split snake body on contact", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(60);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        instance.sprinting = true;
        instance.intent = { getMode: () => "explore" };
        const victim = spawnSnakeChain(state, { col: 20, row: 10 }, { segmentCount: 5, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: victim.chain.head.id, spawnGroupId: victim.chain.spawnGroupId });
        const victimMembers = getOrderedChainMemberIds(state, victim.chain.head.id);
        const struckBody = state.entityRegistry.getLive(victimMembers[2]);
        const fleeHead = pack.head;
        fleeHead.vx = 80;
        fleeHead.vy = 0;
        struckBody.vx = -5;
        struckBody.vy = 0;
        fleeHead.x = struckBody.x - fleeHead.radius - struckBody.radius + 2;
        fleeHead.y = struckBody.y;
        const props = [...victim.chain.members, fleeHead];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, snakeGame);
        assert.equal(getOrderedChainMemberIds(state, victim.chain.head.id).length, victimMembers.length);
    });

    it("opposing flee team head ram kills both agents", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(61);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const charlie = registerFleeCombatAgent(state, snakeGame, { col: 10, row: 10 }, "charlie");
        const delta = registerFleeCombatAgent(state, snakeGame, { col: 12, row: 10 }, "delta");
        resolveFleeHeadCollision(state, snakeGame, charlie, delta);
        assert.equal(charlie.instance.lifecycle, "dead");
        assert.equal(delta.instance.lifecycle, "dead");
        assert.ok(snakeGame.registry.deadHeadIds.has(charlie.pack.head.id));
        assert.ok(snakeGame.registry.deadHeadIds.has(delta.pack.head.id));
    });

    it("opposing flee team blindside kills only the struck agent", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(63);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const striker = registerFleeCombatAgent(state, snakeGame, { col: 10, row: 10 }, "charlie");
        const victim = registerFleeCombatAgent(state, snakeGame, { col: 12, row: 10 }, "delta");
        resolveFleeHeadCollision(state, snakeGame, striker, victim, { leftVx: 80, rightVx: 0 });
        assert.equal(striker.instance.lifecycle, "alive");
        assert.equal(victim.instance.lifecycle, "dead");
    });

    it("same-team flee head-on ram does not kill either agent", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(62);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const left = registerFleeCombatAgent(state, snakeGame, { col: 10, row: 10 }, "charlie");
        const right = registerFleeCombatAgent(state, snakeGame, { col: 12, row: 10 }, "charlie");
        resolveFleeHeadCollision(state, snakeGame, left, right);
        assert.equal(left.instance.lifecycle, "alive");
        assert.equal(right.instance.lifecycle, "alive");
    });

    it("same-team flee blindside does not kill either agent", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(64);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const striker = registerFleeCombatAgent(state, snakeGame, { col: 10, row: 10 }, "charlie");
        const victim = registerFleeCombatAgent(state, snakeGame, { col: 12, row: 10 }, "charlie");
        resolveFleeHeadCollision(state, snakeGame, striker, victim, { leftVx: 80, rightVx: 0 });
        assert.equal(striker.instance.lifecycle, "alive");
        assert.equal(victim.instance.lifecycle, "alive");
    });

    it("low-speed enemy flee head contact still kills the struck agent", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(65);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const left = registerFleeCombatAgent(state, snakeGame, { col: 10, row: 10 }, "charlie");
        const right = registerFleeCombatAgent(state, snakeGame, { col: 12, row: 10 }, "delta");
        resolveFleeHeadCollision(state, snakeGame, left, right, { leftVx: 12, rightVx: 0 });
        assert.equal(left.instance.lifecycle, "alive");
        assert.equal(right.instance.lifecycle, "dead");
    });
});
