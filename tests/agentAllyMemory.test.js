import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { createAgentIntentMemory } from "../Libraries/AI/memory/createAgentIntentMemory.js";
import { buildAgentDecisionContextFor, AGENT_DECISION_PROFILE } from "../Libraries/AI/agents/gameDecisionContext.js";
import { publishAgentEngagement, readAgentEngagement, isAgentEngaged } from "../Libraries/AI/agents/agentEngagement.js";
import { createSnakeAgentSession } from "../Libraries/Game/snake/snakeAgentSession.js";
import { deriveSnakeEngagementState } from "../Libraries/Game/snake/snakeEngagement.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";

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

describe("agent engagement", () => {
    it("publishAgentEngagement stores state on session", () => {
        const session = createSnakeAgentSession({}, { registry: { aliveByHeadId: new Map() }, navWalkable: null, speciesById: new Map() });
        const engagement = { active: true, salience: ["food"], mode: "seek_food" };
        publishAgentEngagement(session, 5, engagement);
        assert.deepEqual(readAgentEngagement(session, 5), engagement);
        assert.equal(isAgentEngaged(session, 5), true);
        assert.equal(isAgentEngaged(session, 6), false);
    });

    it("deriveSnakeEngagementState marks seek_food with visible food as active", () => {
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, {
            visibleWorld: { threat: null, prey: null, food: { id: 1 }, ally: null, allyCount: 0, allyCentroid: null },
        });
        const engagement = deriveSnakeEngagementState(ctx, { mode: "seek_food", targetId: 1 });
        assert.equal(engagement.active, true);
        assert.equal(engagement.mode, "seek_food");
        assert.deepEqual(engagement.salience, ["food"]);
    });

    it("deriveSnakeEngagementState marks explore and seek_ally as inactive", () => {
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, {
            visibleWorld: { threat: null, prey: null, food: { id: 1 }, ally: null, allyCount: 0, allyCentroid: null },
        });
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "explore" }).active, false);
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "seek_ally", targetId: 2 }).active, false);
    });

    it("deriveSnakeEngagementState requires acting on salient target for active modes", () => {
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, {
            visibleWorld: { threat: null, prey: null, food: { id: 1 }, ally: null, allyCount: 0, allyCentroid: null },
        });
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "seek_prey" }).active, false);
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "flee" }).active, false);
    });
});

describe("ally intent memory", () => {
    it("retains ally after line of sight is lost", async () => {
        applySnakeGameConfig({ intentMemory: { allyTtlTicks: 2 } });
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const ally = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const { snakeGame } = wireSnakeTestGame(state, [
            { headId: seeker.head.id, spawnGroupId: seeker.spawnGroupId },
            { headId: ally.head.id, spawnGroupId: ally.spawnGroupId },
        ]);
        publishAgentEngagement(snakeGame, ally.head.id, { active: true, salience: ["food"], mode: "seek_food" });
        seeker.head.faction = "red";
        ally.head.faction = "red";
        const memory = createAgentIntentMemory({ ...getSnakeGameConfig().intentMemory, filterAllyForEngagement: true });
        const visible = { threat: null, prey: null, food: null, ally: ally.head, allyCount: 1, allyCentroid: { x: ally.head.x, y: ally.head.y } };
        const empty = { ...visible, ally: null, allyCount: 0, allyCentroid: null };
        memory.update(seeker.head, state, visible);
        memory.update(seeker.head, state, empty);
        let enriched = memory.enrichWorld(state, empty);
        assert.equal(enriched.ally.id, ally.head.id);
        assert.equal(enriched.memorySource.ally, true);
        memory.update(seeker.head, state, empty);
        enriched = memory.enrichWorld(state, empty);
        assert.equal(enriched.ally.id, ally.head.id);
        memory.update(seeker.head, state, empty);
        enriched = memory.enrichWorld(state, empty);
        assert.equal(enriched.ally, null);
    });

    it("surfaces allyState from memory on decision context", () => {
        applySnakeGameConfig();
        const visibleWorld = { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null };
        const memoryWorld = { ally: { id: 42, x: 100, y: 80 }, allyCount: 1, allyCentroid: null };
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, { visibleWorld, memoryWorld, memorySource: { ally: true } });
        assert.equal(ctx.known.ally.id, 42);
        assert.equal(ctx.allyState.remembered, true);
        assert.equal(ctx.allyState.visible, false);
        assert.ok(ctx.events.includes("ALLY_REMEMBERED"));
    });

    it("flee agent retains ally facts through memory", async () => {
        applySnakeGameConfig({ intentMemory: { allyTtlTicks: 3 } });
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const seekerPack = spawnFleeAgent(state, { col: 10, row: 10 }, { faction: "bravo" });
        const allyPack = spawnFleeAgent(state, { col: 14, row: 10 }, { faction: "bravo" });
        registerAgentInstance(snakeGame, "flee_agent", createFleeAgentInstance(state, { headId: seekerPack.head.id, spawnGroupId: seekerPack.spawnGroupId }));
        registerAgentInstance(snakeGame, "flee_agent", createFleeAgentInstance(state, { headId: allyPack.head.id, spawnGroupId: allyPack.spawnGroupId }));
        const memory = createAgentIntentMemory(getSnakeGameConfig().intentMemory);
        const visible = {
            threat: null,
            food: null,
            ally: allyPack.head,
            allyCount: 1,
            allyCentroid: { x: allyPack.head.x, y: allyPack.head.y },
            threatCount: 0,
        };
        memory.update(seekerPack.head, state, visible);
        const enriched = memory.enrichWorld(state, { ...visible, ally: null, allyCount: 0, allyCentroid: null });
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, { visibleWorld: enriched, memoryWorld: enriched, memorySource: enriched.memorySource });
        assert.equal(ctx.allyState.ally.id, allyPack.head.id);
        assert.equal(ctx.allyState.remembered, true);
    });
});
