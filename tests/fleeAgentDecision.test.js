import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { setFleeHunger } from "../Libraries/Game/snake/fleeAgent/fleeMetabolism.js";
import { buildAgentDecisionContextFor, scoreAgentIntentCandidateDetails, AGENT_DECISION_PROFILE } from "../Libraries/AI/agents/gameDecisionContext.js";
import { deriveSprintIntent } from "../Libraries/AI/agents/deriveSprintIntent.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { primeSnakeHeadVision, createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";
import { getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getAgentProfile } from "../Libraries/AI/agents/agentProfile.js";

const CELL = 16;
function sprintCtx(overrides = {}) {
    return { threatState: null, hungerTier: null, foodFraction: null, ...overrides };
}
function fleeReach(overrides = {}) {
    return { threat: null, enemy: null, food: null, ally: null, ...overrides };
}

function mockTarget(id) {
    return { id, x: 0, y: 0, type: "snake_head", isDead: false };
}

describe("flee agent decision model", () => {
    it("deriveSprintIntent blocks flee sprint when hunger is critically low", () => {
        applySnakeGameConfig({ fleeAgent: { sprint: { fleeSeverity: 0.5, sprintFleeMinHunger: 0.1 }, decisionPressure: { sprintFleeMinHunger: 0.1 } } });
        const sprint = getAgentProfile(AGENT_DECISION_PROFILE.flee).sprint;
        assert.equal(deriveSprintIntent("flee", sprintCtx({ threatState: { lethal: true, severity: 1 }, hungerTier: "desperate", foodFraction: 0.05 }), sprint).want, false);
    });

    it("deriveSprintIntent sprints on flee when threat is severe enough", () => {
        applySnakeGameConfig({ fleeAgent: { sprint: { fleeSeverity: 0.5 } } });
        const sprint = getAgentProfile(AGENT_DECISION_PROFILE.flee).sprint;
        const result = deriveSprintIntent("flee", sprintCtx({ threatState: { lethal: false, severity: 0.6 }, hungerTier: "hungry", foodFraction: 0.6 }), sprint);
        assert.equal(result.want, true);
        assert.equal(result.reason, "escape");
    });

    it("deriveSprintIntent only sprints on seek_food when desperate", () => {
        applySnakeGameConfig({ fleeAgent: { sprint: { fleeSeverity: 0.4 } } });
        const sprint = getAgentProfile(AGENT_DECISION_PROFILE.flee).sprint;
        const threat = { lethal: false, severity: 0.5 };
        assert.equal(deriveSprintIntent("seek_food", sprintCtx({ threatState: threat, hungerTier: "hungry", foodFraction: 0.5 }), sprint).want, false);
        assert.equal(deriveSprintIntent("seek_food", sprintCtx({ threatState: threat, hungerTier: "desperate", foodFraction: 0.2 }), sprint).want, true);
    });

    it("explores when only smaller snakes are visible and no food", () => {
        applySnakeGameConfig();
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: null, food: null, ally: null, allyCount: 0, threatCount: 0 },
            foodFraction: 0.55,
        });
        assert.equal(ctx.chosenIntent.mode, "explore");
        assert.equal(ctx.sprintIntent.want, false);
    });

    it("seek_ally beats explore when a visible ally is present and hunger is satisfied", () => {
        applySnakeGameConfig();
        const ally = mockTarget("ally1");
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: {
                threat: null,
                food: null,
                ally,
                allyCount: 1,
                allyCentroid: { x: 64, y: 0 },
                threatCount: 0,
            },
            reachSteps: fleeReach({ ally: 4 }),
            foodFraction: 0.9,
        });
        assert.equal(ctx.chosenIntent.mode, "seek_ally");
        assert.equal(ctx.chosenIntent.targetId, "ally1");
        assert.ok(ctx.candidateScores.seek_ally > ctx.candidateScores.explore);
    });

    it("regroups toward a visible ally instead of exploring", async () => {
        resetKineticConstraintIds(42);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { sprint: { fleeSeverity: 0.5 } } });
        const seekerPack = spawnFleeAgent(state, { col: 10, row: 10 }, { faction: "bravo" });
        const allyPack = spawnFleeAgent(state, { col: 14, row: 10 }, { faction: "bravo" });
        const seeker = createFleeAgentInstance(state, { headId: seekerPack.head.id, spawnGroupId: seekerPack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", seeker);
        seeker.start(state);
        setFleeHunger(seeker.metabolism, 0.9);
        seekerPack.head.facing = 0;
        allyPack.head.x = seekerPack.head.x + 64;
        allyPack.head.y = seekerPack.head.y;
        registerAgentInstance(snakeGame, "flee_agent", createFleeAgentInstance(state, { headId: allyPack.head.id, spawnGroupId: allyPack.spawnGroupId }));
        primeSnakeHeadVision(state, seekerPack.head, getSnakeGameConfig().visionRange);
        seeker.tick(state, 16);
        assert.equal(seeker.intent.getMode(), "seek_ally");
        assert.equal(seeker.intent.getTargetId(), allyPack.head.id);
    });

    it("flee beats explore when a visible threat is present", () => {
        applySnakeGameConfig();
        const ctx = buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.flee, {
            visibleWorld: { threat: mockTarget("t1"), food: null, threatCount: 1 },
            reachSteps: fleeReach({ threat: 4 }),
            foodFraction: 0.55,
        });
        assert.equal(ctx.chosenIntent.mode, "flee");
        assert.equal(ctx.sprintIntent.want, true);
    });

    it("flee beats explore when outnumbered by visible threats", () => {
        applySnakeGameConfig({ fleeAgent: { decisionPressure: { outnumberedFleeBonus: 0.5 } }, fleeRange: 128, lethalThreatRange: 48 });
        const hungerTier = "hungry";
        const threatState = { dist: 64, severity: 0.5, lethal: false };
        const ctx = {
            known: { threat: mockTarget("t1"), food: null, threatCount: 2 },
            remembered: { threat: null, food: null },
            reachSteps: fleeReach({ threat: 4 }),
            committedTarget: null,
            routeStatus: null,
            hungerTier,
            threatState,
            events: [],
        };
        const scores = scoreAgentIntentCandidateDetails(AGENT_DECISION_PROFILE.flee, ctx);
        assert.ok(scores.flee.net > scores.explore.net);
    });

    it("flees from a visible smaller snake instead of exploring", async () => {
        resetKineticConstraintIds(41);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { sprint: { fleeSeverity: 0.3 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.7);
        const threat = spawnSnakeChain(state, { col: 10, row: 14 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: threat.chain.head.id, spawnGroupId: threat.chain.spawnGroupId });
        threat.chain.head.faction = "snake";
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionRange);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
        assert.equal(instance.sprinting, true);
    });

    it("flees from a visible larger snake instead of exploring", async () => {
        resetKineticConstraintIds(40);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { sprint: { fleeSeverity: 0.3 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.7);
        const threat = spawnSnakeChain(state, { col: 10, row: 14 }, { segmentCount: 6, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: threat.chain.head.id, spawnGroupId: threat.chain.spawnGroupId });
        threat.chain.head.faction = "snake";
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionRange);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
        assert.equal(instance.sprinting, true);
    });
});
