import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { registerAgentInstance, resolveAgentRelationship } from "../Libraries/Game/snake/snakeAgentSession.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { perceiveAgentIntentWorld } from "../Libraries/Game/snake/agentIntentPerception.js";
import { publishAgentEngagement } from "../Libraries/AI/agents/agentEngagement.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, primeSnakeHeadVision, createWiredSnakeAutosim } from "./harness/snakeGameHarness.js";

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

function wireSnakes(state, snakes) {
    const { snakeGame, registry } = wireSnakeTestGame(
        state,
        snakes.map(({ chain }) => ({ headId: chain.head.id, spawnGroupId: chain.spawnGroupId })),
    );
    for (const { chain, faction } of snakes) {
        if (faction) chain.head.faction = faction;
    }
    return { snakeGame, registry };
}

function registerFlee(state, snakeGame, pack) {
    const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
    registerAgentInstance(snakeGame, "flee_agent", instance);
    return instance;
}

describe("ally perception", () => {
    it("snake perceives nearest visible same-faction ally", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const allyNear = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const allyFar = spawnLinkedBallChain(state, { col: 18, row: 10 }, chainOptions(3));
        const enemy = spawnLinkedBallChain(state, { col: 12, row: 14 }, chainOptions(3));
        const { registry } = wireSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: allyNear, faction: "red" },
            { chain: allyFar, faction: "red" },
            { chain: enemy, faction: "blue" },
        ]);
        seeker.head.facing = 0;
        allyNear.head.x = seeker.head.x + 64;
        allyNear.head.y = seeker.head.y;
        allyFar.head.x = seeker.head.x + 128;
        allyFar.head.y = seeker.head.y;
        enemy.head.x = seeker.head.x + 64;
        enemy.head.y = seeker.head.y + 64;
        primeSnakeHeadVision(state, seeker.head);
        const world = perceiveAgentIntentWorld(seeker.head, seeker.head.id, state, registry, () => null);
        assert.equal(world.ally.id, allyNear.head.id);
        assert.equal(world.allyCount, 2);
        assert.ok(Math.abs(world.allyCentroid.x - (allyNear.head.x + allyFar.head.x) / 2) < 0.01);
        assert.ok(Math.abs(world.allyCentroid.y - seeker.head.y) < 0.01);
        assert.equal(world.prey?.id, enemy.head.id);
        assert.equal(world.threat, null);
    });

    it("flee agent perceives same-faction flee allies", async () => {
        applySnakeGameConfig({ fleeRange: 128, startRadius: 2 });
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame, registry } = wireSnakeTestGame(state);
        const seekerPack = spawnFleeAgent(state, { col: 10, row: 10 }, { faction: "bravo" });
        const allyPack = spawnFleeAgent(state, { col: 14, row: 10 }, { faction: "bravo" });
        const strangerPack = spawnFleeAgent(state, { col: 10, row: 14 }, { faction: "other" });
        registerFlee(state, snakeGame, seekerPack);
        registerFlee(state, snakeGame, allyPack);
        registerFlee(state, snakeGame, strangerPack);
        seekerPack.head.facing = 0;
        allyPack.head.x = seekerPack.head.x + 64;
        allyPack.head.y = seekerPack.head.y;
        strangerPack.head.x = seekerPack.head.x + 64;
        strangerPack.head.y = seekerPack.head.y + 64;
        primeSnakeHeadVision(state, seekerPack.head, getSnakeGameConfig().visionRange);
        const world = perceiveAgentIntentWorld(seekerPack.head, seekerPack.head.id, state, registry, () => null, getSnakeGameConfig().visionRange);
        assert.equal(world.ally.id, allyPack.head.id);
        assert.equal(world.allyCount, 1);
        assert.equal(world.threat, null);
    });

    it("same-faction flee agents resolve as ally", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const a = spawnFleeAgent(state, { col: 10, row: 10 }, { faction: "bravo" });
        const b = spawnFleeAgent(state, { col: 14, row: 10 }, { faction: "bravo" });
        registerFlee(state, snakeGame, a);
        registerFlee(state, snakeGame, b);
        assert.equal(resolveAgentRelationship(snakeGame, a.head.id, b.head.id, state), "ally");
    });

    it("satisfied snake regroups toward a visible ally that is actively foraging", async () => {
        applySnakeGameConfig({ fleeRange: 128, startRadius: 2 });
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const ally = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const { snakeGame } = wireSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: ally, faction: "red" },
        ]);
        publishAgentEngagement(snakeGame, ally.head.id, { active: true, salience: ["food"], mode: "seek_food" });
        const autosim = createWiredSnakeAutosim(state, { headId: seeker.head.id, initialFoodFraction: 0.9 });
        seeker.head.facing = 0;
        ally.head.x = seeker.head.x + 64;
        ally.head.y = seeker.head.y;
        primeSnakeHeadVision(state, seeker.head);
        autosim.start();
        autosim.tick(16);
        assert.equal(autosim.getMode(), "seek_ally");
        assert.equal(autosim.getTargetId(), ally.head.id);
    });

    it("does not regroup toward an idle exploring ally", async () => {
        applySnakeGameConfig({ fleeRange: 128, startRadius: 2 });
        resetKineticConstraintIds(5);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const ally = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const { snakeGame } = wireSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: ally, faction: "red" },
        ]);
        publishAgentEngagement(snakeGame, ally.head.id, { active: false, salience: [], mode: "explore" });
        const autosim = createWiredSnakeAutosim(state, { headId: seeker.head.id, initialFoodFraction: 0.9 });
        seeker.head.facing = 0;
        ally.head.x = seeker.head.x + 64;
        ally.head.y = seeker.head.y;
        primeSnakeHeadVision(state, seeker.head);
        autosim.start();
        autosim.tick(16);
        assert.notEqual(autosim.getMode(), "seek_ally");
    });

    it("does not regroup toward an ally that is also seek_ally", async () => {
        applySnakeGameConfig({ fleeRange: 128, startRadius: 2 });
        resetKineticConstraintIds(6);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const ally = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const { snakeGame } = wireSnakes(state, [
            { chain: seeker, faction: "red" },
            { chain: ally, faction: "red" },
        ]);
        publishAgentEngagement(snakeGame, ally.head.id, { active: false, salience: [], mode: "seek_ally" });
        const autosim = createWiredSnakeAutosim(state, { headId: seeker.head.id, initialFoodFraction: 0.9 });
        seeker.head.facing = 0;
        ally.head.x = seeker.head.x + 64;
        ally.head.y = seeker.head.y;
        primeSnakeHeadVision(state, seeker.head);
        autosim.start();
        autosim.tick(16);
        assert.notEqual(autosim.getMode(), "seek_ally");
    });
});
