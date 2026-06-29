import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { spawnGameAgentChain } from "../Libraries/Game/snake/spawnAgentChain.js";

import { AgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { createAgentIntentMemory, createSnakeAgentSession, registerAgentInstance } from "./harness/agentTestCompat.js";
import { buildAgentDecisionContextFor, AGENT_DECISION_PROFILE, scoreAgentIntentCandidates } from "../Libraries/AI/agents/AgentDecisionContext.js";
import { publishAgentEngagement, readAgentEngagement, isAgentEngaged } from "../Libraries/AI/agents/AgentProfiles.js";
import { classifyAgentVisionInto } from "../Libraries/AI/perception/classifyAgentVision.js";

import { deriveSnakeEngagementState } from "../Libraries/AI/agents/AgentDecisionContext.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";

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

describe("agent engagement", () => {
    it("publishAgentEngagement stores state on session", () => {
        const session = createSnakeAgentSession({ registry: { instancesByHeadId: new Map(), instancesByMemberId: new Map(), deadHeadIds: new Set(), inertByLeadId: new Map() }, navWalkable: null, speciesById: new Map() });
        const engagement = { active: true, salience: ["food"], mode: "seek_food" };
        publishAgentEngagement(session, 5, engagement);
        assert.deepEqual(readAgentEngagement(session, 5), engagement);
        assert.equal(isAgentEngaged(session, 5), true);
        assert.equal(isAgentEngaged(session, 6), false);
    });

    it("deriveSnakeEngagementState marks seek_food with visible food as active", () => {
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, {
            visibleWorld: { threat: null, prey: null, food: { id: 1 }, ally: null, allyCount: 0, allyCentroid: null },
            shared: getSnakeGameConfig().shared,
        });
        const engagement = deriveSnakeEngagementState(ctx, { mode: "seek_food", targetId: 1 });
        assert.equal(engagement.active, true);
        assert.equal(engagement.mode, "seek_food");
        assert.deepEqual(engagement.salience, ["food"]);
    });

    it("deriveSnakeEngagementState marks explore and seek_ally as inactive", () => {
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, {
            visibleWorld: { threat: null, prey: null, food: { id: 1 }, ally: null, allyCount: 0, allyCentroid: null },
            shared: getSnakeGameConfig().shared,
        });
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "explore" }).active, false);
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "seek_ally", targetId: 2 }).active, false);
    });

    it("deriveSnakeEngagementState requires acting on salient target for active modes", () => {
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, {
            visibleWorld: { threat: null, prey: null, food: { id: 1 }, ally: null, allyCount: 0, allyCentroid: null },
            shared: getSnakeGameConfig().shared,
        });
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "seek_prey" }).active, false);
        assert.equal(deriveSnakeEngagementState(ctx, { mode: "flee" }).active, false);
    });
});

describe("ally intent memory", () => {
    it("retains ally after line of sight is lost", async () => {
        applySnakeGameConfig({ shared: { intentMemory: { allyTtlTicks: 2 } } });
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
        const memory = createAgentIntentMemory({ ...getSnakeGameConfig().shared.intentMemory, filterAllyForEngagement: true });
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
        const memoryWorld = { ally: { id: 42, x: 100, y: 80 }, allyCount: 1, allyCentroid: null, memorySource: { ally: true } };
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, { visibleWorld, memoryWorld, shared: getSnakeGameConfig().shared });
        assert.equal(ctx.known.ally.id, 42);
        assert.equal(ctx.allyState.remembered, true);
        assert.equal(ctx.allyState.visible, false);
        assert.ok(ctx.events.includes("ALLY_REMEMBERED"));
    });

    it("flee agent retains ally facts through memory", async () => {
        applySnakeGameConfig({ shared: { intentMemory: { allyTtlTicks: 3 } } });
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const seekerPack = spawnGameAgentChain(state, { col: 10, row: 10 }, "flee_agent", { faction: "bravo" });
        const allyPack = spawnGameAgentChain(state, { col: 14, row: 10 }, "flee_agent", { faction: "bravo" });
        registerAgentInstance(snakeGame, "flee_agent", new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: seekerPack.head, spawnGroupId: seekerPack.spawnGroupId }));
        registerAgentInstance(snakeGame, "flee_agent", new AgentInstance(state, { profileId: AGENT_PROFILE.flee, head: allyPack.head, spawnGroupId: allyPack.spawnGroupId }));
        const memory = createAgentIntentMemory(getSnakeGameConfig().shared.intentMemory);
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
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, { visibleWorld: enriched, memoryWorld: enriched, memorySource: enriched.memorySource, shared: getSnakeGameConfig().shared });
        assert.equal(ctx.allyState.ally.id, allyPack.head.id);
        assert.equal(ctx.allyState.remembered, true);
    });
});

describe("emergent squad following and regrouping", () => {
    it("asymmetric ally selection by entity ID", () => {
        const allyLowProp = { id: "ally_low", x: 20, y: 0 };
        const allyHighProp = { id: "ally_high", x: 40, y: 0 };
        const state = {
            entityRegistry: {
                queryView: () => [allyLowProp, allyHighProp]
            },
            nav: {
                observerVisionFrame: {
                    ensureHeadVision: () => ({
                        cells: [0],
                        cellSet: new Set([0])
                    }),
                    navTopology: { grid: { cols: 64, worldCol: () => 0, worldRow: () => 0 } }
                }
            },
            sandbox: {
                snakeGame: {
                    instancesByHeadId: new Map([
                        ["seeker", { lifecycle: "alive", head: { id: "seeker", x: 0, y: 0 }, intent: { getMode: () => "seek_ally", getTargetId: () => "none" } }],
                        ["ally_low", { lifecycle: "alive", head: allyLowProp, intent: { getMode: () => "seek_ally", getTargetId: () => "seeker" } }],
                        ["ally_high", { lifecycle: "alive", head: allyHighProp, intent: { getMode: () => "seek_ally", getTargetId: () => "seeker" } }]
                    ])
                }
            }
        };

        const seeker = { id: "seeker", x: 0, y: 0, visionRange: { range: 100 } };
        const resolveRelationship = (agent, target) => "ally";

        const out = {};
        classifyAgentVisionInto(out, state, seeker, {
            resolveRelationship,
            trackPrey: false,
            visionRange: { range: 100 }
        });

        assert.equal(out.ally.id, "ally_low", "Should only follow allies with lower IDs when loop is detected");
        assert.equal(out.allyCount, 2, "Should still count all allies in the pack");
    });

    it("regroupAlly scorer does not abort at close range", () => {
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: null, prey: null, food: null, ally: { id: "ally_1" }, allyCount: 1, allyCentroid: null },
            reachSteps: { ally: 2 }, // 2 cells away (close range)
            shared: getSnakeGameConfig().shared,
            instance: { ammo: 10 }
        });

        const score = scoreAgentIntentCandidates(AGENT_DECISION_PROFILE.flee, ctx);
        assert.ok(score.seek_ally > -Infinity, "Should retain seek_ally score when close to teammate");
    });
});

describe("generic target claiming", () => {
    it("classifyAgentVisionInto applies soft discount to claimed enemies", () => {
        const enemyProp = { id: "enemy_1", x: 20, y: 0 };
        const state = {
            entityRegistry: {
                queryView: () => [enemyProp]
            },
            nav: {
                observerVisionFrame: {
                    ensureHeadVision: () => ({
                        cells: [0],
                        cellSet: new Set([0])
                    }),
                    navTopology: { grid: { cols: 64, worldCol: () => 0, worldRow: () => 0 } }
                }
            },
            sandbox: {
                snakeGame: {
                    instancesByHeadId: new Map([
                        ["seeker", { lifecycle: "alive", head: { id: "seeker", x: 0, y: 0 } }],
                        ["enemy_1", { lifecycle: "alive", head: enemyProp }]
                    ]),
                    factionTargetRegistry: {
                        isClaimedByCloser: (targetId, seekerId, distSq) => {
                            return targetId === "enemy_1";
                        }
                    }
                }
            }
        };

        const seeker = { id: "seeker", x: 0, y: 0, visionRange: { range: 100 } };
        const resolveRelationship = () => "threat";

        const out = {};
        classifyAgentVisionInto(out, state, seeker, {
            resolveRelationship,
            trackPrey: false,
            visionRange: { range: 100 }
        });

        assert.equal(out.threat.id, "enemy_1", "Should still detect the enemy");
    });
});
