import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { resolveAgentRelationship } from "../Libraries/Game/snake/snakeAgentSession.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";

loadPropAssets();

function chainOptions(segmentCount) {
    const config = getSnakeGameConfig();
    return {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.linkSlack,
        ballType: config.segmentPropId,
        headBallType: config.headPropId,
        growDirX: config.growDirX,
        growDirY: config.growDirY,
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

    it("opposite faction smaller snake is prey", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "blue" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "prey");
    });

    it("opposite faction larger snake is threat", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "blue" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "threat");
    });

    it("opposite faction equal size is neutral", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const target = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const snakeGame = wireRelationshipSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: target, faction: "blue" },
        ]);
        assert.equal(resolveAgentRelationship(snakeGame, seeker.head.id, target.head.id, state), "neutral");
    });

    it("missing faction is neutral", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(5);
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
