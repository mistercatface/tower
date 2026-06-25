import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { resolveRelationshipForInstances } from "../Libraries/Game/snake/agentRelationships.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";
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
function instanceFor(snakeGame, pack) {
    return snakeGame.instancesByHeadId.get(pack.head.id);
}
function relationship(snakeGame, seeker, target) {
    return resolveRelationshipForInstances(instanceFor(snakeGame, seeker), instanceFor(snakeGame, target));
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
        assert.equal(relationship(snakeGame, seeker, target), "ally");
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
        assert.equal(relationship(snakeGame, seeker, target), "rival");
        assert.equal(relationship(snakeGame, target, seeker), "rival");
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
        assert.equal(relationship(snakeGame, seeker, target), "prey");
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
        assert.equal(relationship(snakeGame, seeker, target), "threat");
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
        assert.equal(relationship(snakeGame, seeker, target), "rival");
    });

    it("flee agent treats any snake as threat", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(6);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const pack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent");
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        const smallSnake = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        registerSnakeTestInstance(state, snakeGame, { headId: smallSnake.head.id, spawnGroupId: smallSnake.spawnGroupId });
        smallSnake.head.faction = "blue";
        const seekerInstance = instanceFor(snakeGame, pack);
        const targetInstance = instanceFor(snakeGame, smallSnake);
        assert.equal(resolveRelationshipForInstances(seekerInstance, targetInstance, undefined, 30 * 30), "threat");
    });

    it("same-faction flee agents are allies and opposite teams are prey", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(8);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const charlieA = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent", { faction: "charlie" });
        const charlieB = spawnGameAgentChain(state, { col: 12, row: 10 }, "flee_agent", { faction: "charlie" });
        const delta = spawnGameAgentChain(state, { col: 14, row: 10 }, "flee_agent", { faction: "delta" });
        for (const pack of [charlieA, charlieB, delta]) {
            const instance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: pack.head, spawnGroupId: pack.spawnGroupId });
            registerAgentInstance(snakeGame, "flee_agent", instance);
        }
        assert.equal(relationship(snakeGame, charlieA, charlieB), "ally");
        assert.equal(relationship(snakeGame, charlieA, delta), "prey");
        assert.equal(relationship(snakeGame, delta, charlieA), "prey");
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
        assert.equal(relationship(snakeGame, seeker, target), "neutral");
    });
});
