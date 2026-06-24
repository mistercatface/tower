import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnSquidChain } from "../Libraries/Game/snake/spawnAgentChain.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "../Libraries/Game/snake/snakeCombat.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";

function registerSquidPair(state, snakeGame) {
    const leftPack = spawnSquidChain(state, { col: 10, row: 10 }, { faction: "charlie" });
    const leftInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.squid, head: leftPack.brain, spawnGroupId: leftPack.spawnGroupId });
    registerAgentInstance(snakeGame, "squid", leftInstance);
    const rightPack = spawnSquidChain(state, { col: 14, row: 10 }, { faction: "delta" });
    const rightInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.squid, head: rightPack.brain, spawnGroupId: rightPack.spawnGroupId });
    registerAgentInstance(snakeGame, "squid", rightInstance);
    return { leftPack, leftInstance, rightPack, rightInstance };
}

function resolveSquidContact(state, snakeGame, props, { leftVx = 40, rightVx = -40 } = {}) {
    props[0].vx = leftVx;
    props[0].vy = 0;
    props[1].vx = rightVx;
    props[1].vy = 0;
    const tick = attachKineticTestTickFromState(state, props, 50);
    const pairs = gatherKineticContactPairs(tick);
    resolveKineticContactPassWithPairs(tick, pairs);
    applyKineticContactSideEffects(tick, kineticContactBuffer);
    resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, snakeGame);
}

describe("squid vs squid combat", () => {
    it("opposing brain contact kills at least one squid", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 35 });
        resetKineticConstraintIds(80);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const { leftPack, leftInstance, rightPack, rightInstance } = registerSquidPair(state, snakeGame);
        const leftBrain = leftPack.brain;
        const rightBrain = rightPack.brain;
        leftBrain.x = rightBrain.x - leftBrain.radius - rightBrain.radius + 1;
        leftBrain.y = rightBrain.y;
        resolveSquidContact(state, snakeGame, [leftBrain, rightBrain], { leftVx: 60, rightVx: -60 });
        assert.ok(leftInstance.lifecycle === "dead" || rightInstance.lifecycle === "dead");
    });

    it("arm hitting enemy brain kills the brain owner", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 35 });
        resetKineticConstraintIds(81);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const { leftPack, leftInstance, rightPack, rightInstance } = registerSquidPair(state, snakeGame);
        const leftArm = leftPack.members[0];
        const rightBrain = rightPack.brain;
        leftArm.x = rightBrain.x - leftArm.radius - rightBrain.radius + 1;
        leftArm.y = rightBrain.y;
        resolveSquidContact(state, snakeGame, [leftArm, rightBrain], { leftVx: 20, rightVx: 0 });
        assert.equal(rightInstance.lifecycle, "dead");
        assert.equal(leftInstance.lifecycle, "alive");
    });

    it("arm vs arm wrestling kills a squid at moderate speed", async () => {
        applySnakeGameConfig({ splitImpulseThreshold: 35 });
        resetKineticConstraintIds(82);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const { leftPack, leftInstance, rightPack, rightInstance } = registerSquidPair(state, snakeGame);
        const leftArm = leftPack.members[0];
        const rightArm = rightPack.members[0];
        leftArm.x = rightArm.x - leftArm.radius - rightArm.radius + 1;
        leftArm.y = rightArm.y;
        resolveSquidContact(state, snakeGame, [...leftPack.members, ...rightPack.members], { leftVx: 24, rightVx: -24 });
        assert.ok(leftInstance.lifecycle === "dead" || rightInstance.lifecycle === "dead");
    });
});
