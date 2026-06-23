import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { resolveAgentRelationship } from "../Libraries/Game/snake/snakeAgentSession.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/spawnAgentChain.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";

function chainOptions(segmentCount) {
    const config = getSnakeGameConfig();
    return {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.agentProfiles.snake.linkSlack,
        ballType: config.agentProfiles.snake.bodyPropId,
        headBallType: config.agentProfiles.snake.headPropId,
        growDirX: config.agentProfiles.snake.growDirX,
        growDirY: config.agentProfiles.snake.growDirY,
    };
}

function wireRelationshipSnakes(state, snakes) {
    const { snakeGame } = wireSnakeTestGame(
        state,
        snakes.map(({ chain }) => ({ headId: chain.head.id, spawnGroupId: chain.spawnGroupId })),
    );
    for (const { chain, faction } of snakes) {
        if (faction) chain.head.faction = faction;
    }
    return snakeGame;
}

describe("resolveAgentRelationship team hunting", () => {
    it("same faction smaller snake is ally", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "red" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "ally");
    });

    it("opposite faction within rival band is rival", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "blue" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "rival");
        assert.equal(resolveAgentRelationship(snakeGame, target.head.id, seeker.head.id, state), "rival");
    });

    it("opposite faction outside rival band smaller snake is prey", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(6));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "blue" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "prey");
    });

    it("opposite faction outside rival band larger snake is threat", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(6));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "blue" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "threat");
    });

    it("opposite faction equal size is rival", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(5);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "blue" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "rival");
    });

    it("flee agent treats any snake as threat", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(6);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee,  headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        const smallSnake = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        registerSnakeTestInstance(state, snakeGame, { headId: smallSnake.head.id, spawnGroupId: smallSnake.spawnGroupId });
        smallSnake.head.faction = "blue";
        assert.equal(resolveAgentRelationship(snakeGame, pack.head.id, smallSnake.head.id, state), "threat");
    });

    it("same-faction flee agents are allies and opposite teams are prey", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(8);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const charlieA = spawnFleeAgent(state, { col: 10, row: 10 }, { faction: "charlie" });
        const charlieB = spawnFleeAgent(state, { col: 12, row: 10 }, { faction: "charlie" });
        const delta = spawnFleeAgent(state, { col: 14, row: 10 }, { faction: "delta" });
        for (const pack of [charlieA, charlieB, delta]) {
            const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee,  headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
            registerAgentInstance(snakeGame, "flee_agent", instance);
        }
        assert.equal(resolveAgentRelationship(snakeGame, charlieA.head.id, charlieB.head.id, state), "ally");
        assert.equal(resolveAgentRelationship(snakeGame, charlieA.head.id, delta.head.id, state), "prey");
        assert.equal(resolveAgentRelationship(snakeGame, delta.head.id, charlieA.head.id, state), "prey");
    });

    it("missing faction is neutral", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(7);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: null },
        ]);
        target.head.faction = null;
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "neutral");
    });
});
