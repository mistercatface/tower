import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent, spawnSquidChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "../Libraries/Game/snake/snakeCombat.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";

function registerSquidAndFlee(state, snakeGame) {
    const squidPack = spawnSquidChain(state, { col: 10, row: 10 }, { faction: "charlie" });
    const squidInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.squid, head: squidPack.brain, spawnGroupId: squidPack.spawnGroupId });
    registerAgentInstance(snakeGame, "squid", squidInstance);
    const fleePack = spawnFleeAgent(state, { col: 14, row: 10 }, { faction: "bravo" });
    const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
    registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
    return { squidPack, squidInstance, fleePack, fleeInstance };
}

function resolveSquidArmFleeCollision(state, squidPack, fleePack, { relSpeed = 5 } = {}) {
    const arm = squidPack.members[0];
    const fleeHead = fleePack.head;
    fleeHead.vx = -relSpeed;
    fleeHead.vy = 0;
    arm.vx = relSpeed * 0.5;
    arm.vy = 0;
    fleeHead.x = arm.x + arm.radius + fleeHead.radius - 1;
    fleeHead.y = arm.y;
    const tick = attachKineticTestTickFromState(state, [...squidPack.members, fleeHead], 50);
    const pairs = gatherKineticContactPairs(tick);
    resolveKineticContactPassWithPairs(tick, pairs);
    applyKineticContactSideEffects(tick, kineticContactBuffer);
    resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
}

describe("squid vs flee combat", () => {
    it("squid arm contact kills flee even at low speed", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 35 });
        resetKineticConstraintIds(70);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const { squidPack, fleePack, fleeInstance } = registerSquidAndFlee(state, snakeGame);
        resolveSquidArmFleeCollision(state, squidPack, fleePack, { relSpeed: 4 });
        assert.equal(fleeInstance.lifecycle, "dead");
        assert.ok(snakeGame.registry.deadHeadIds.has(fleePack.head.id));
    });

    it("flee ramming squid brain still kills flee", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 35 });
        resetKineticConstraintIds(71);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const { squidPack, fleePack, fleeInstance } = registerSquidAndFlee(state, snakeGame);
        const brain = squidPack.brain;
        const fleeHead = fleePack.head;
        fleeHead.vx = 80;
        fleeHead.vy = 0;
        brain.vx = 0;
        brain.vy = 0;
        fleeHead.x = brain.x - fleeHead.radius - brain.radius + 1;
        fleeHead.y = brain.y;
        const tick = attachKineticTestTickFromState(state, [...squidPack.members, fleeHead], 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.equal(fleeInstance.lifecycle, "dead");
    });
});
