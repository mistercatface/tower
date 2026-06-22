import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { setFleeHunger } from "../Libraries/Game/snake/fleeAgent/fleeMetabolism.js";
import { buildFleeDecisionContext, deriveFleeSprintIntent, scoreFleeIntentCandidateDetails } from "../Libraries/Game/snake/fleeAgent/fleeDecisionModel.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { primeSnakeHeadVision, createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";
import { getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";

loadPropAssets();

function mockTarget(id) {
    return { id, x: 0, y: 0, type: "snake_head", isDead: false };
}

describe("flee agent decision model", () => {
    it("deriveFleeSprintIntent blocks flee sprint when hunger is critically low", () => {
        applySnakeGameConfig({ fleeAgent: { sprint: { fleeSeverity: 0.5, sprintFleeMinHunger: 0.1 }, decisionPressure: { sprintFleeMinHunger: 0.1 } } });
        const starving = { foodFraction: 0.05, state: "desperate", desperate: true };
        assert.equal(deriveFleeSprintIntent("flee", { lethal: true, severity: 1 }, starving).want, false);
        assert.equal(deriveFleeSprintIntent("hunt", null, starving).want, false);
    });

    it("deriveFleeSprintIntent sprints on hunt when hunger reserve is met", () => {
        applySnakeGameConfig({ fleeAgent: { decisionPressure: { huntMinHunger: 0.25 } } });
        const fed = { foodFraction: 0.6, state: "hungry", hungry: true };
        const sprint = deriveFleeSprintIntent("hunt", null, fed);
        assert.equal(sprint.want, true);
        assert.equal(sprint.reason, "murder");
    });

    it("deriveFleeSprintIntent only sprints on seek_food when desperate", () => {
        applySnakeGameConfig({ fleeAgent: { sprint: { fleeSeverity: 0.4 } } });
        const threat = { lethal: false, severity: 0.5 };
        assert.equal(deriveFleeSprintIntent("seek_food", threat, { foodFraction: 0.5, state: "hungry", desperate: false }).want, false);
        assert.equal(deriveFleeSprintIntent("seek_food", threat, { foodFraction: 0.2, state: "desperate", desperate: true }).want, true);
    });

    it("prefers hunt over explore when prey is visible and hunger is sufficient", () => {
        applySnakeGameConfig();
        const { decisionSnapshot } = buildFleeDecisionContext({
            visibleWorld: { threat: null, prey: mockTarget("prey_a"), preyDist: 6, food: null, threatCount: 0, aggregateThreatSeverity: 0 },
            foodFraction: 0.55,
        });
        assert.equal(decisionSnapshot.chosenIntent.mode, "hunt");
        assert.equal(decisionSnapshot.chosenIntent.targetId, "prey_a");
        assert.equal(decisionSnapshot.sprintIntent.want, true);
    });

    it("blocks hunt when hunger is below huntMinHunger reserve", () => {
        applySnakeGameConfig({ fleeAgent: { decisionPressure: { huntMinHunger: 0.25 } } });
        const { decisionSnapshot } = buildFleeDecisionContext({
            visibleWorld: { threat: null, prey: mockTarget("prey_a"), preyDist: 4, food: null, threatCount: 0, aggregateThreatSeverity: 0 },
            foodFraction: 0.2,
        });
        assert.notEqual(decisionSnapshot.chosenIntent.mode, "hunt");
    });

    it("flee beats hunt when outnumbered by visible threats", () => {
        applySnakeGameConfig({ fleeAgent: { decisionPressure: { outnumberedFleeBonus: 0.5, huntThreatPenalty: 180 } }, fleeRange: 128, lethalThreatRange: 48 });
        const hungerState = { foodFraction: 0.7, state: "hungry", hungry: true, satisfied: false, desperate: false };
        const threatState = { dist: 64, severity: 0.5, lethal: false };
        const blackboard = {
            facts: {
                visible: { threat: mockTarget("t1"), prey: mockTarget("prey_a"), food: null, threatDist: 64, preyDist: 8, foodDist: null, threatCount: 2, aggregateThreatSeverity: 0.9 },
                remembered: { threat: null, prey: null, food: null, preyDist: null, foodDist: null },
                known: { threat: mockTarget("t1"), prey: mockTarget("prey_a"), food: null, threatDist: 64, preyDist: 8, foodDist: null, threatCount: 2, aggregateThreatSeverity: 0.9 },
                committedTarget: null,
                routeStatus: null,
                hungerState,
                threatState,
            },
            events: [],
        };
        const scores = scoreFleeIntentCandidateDetails(blackboard);
        assert.ok(scores.flee.net > scores.hunt.net);
    });

    it("chooses hunt over flee when only one weaker snake is visible", async () => {
        resetKineticConstraintIds(40);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { decisionPressure: { huntMinHunger: 0.25 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.55);
        const prey = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId });
        prey.chain.head.faction = "snake";
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "hunt");
        assert.equal(instance.intent.getTargetId(), prey.chain.head.id);
        assert.equal(instance.sprinting, true);
    });

    it("flees instead of hunting when a larger snake is nearby", async () => {
        resetKineticConstraintIds(41);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, fleeAgent: { sprint: { fleeSeverity: 0.3 } } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        instance.start(state);
        setFleeHunger(instance.metabolism, 0.7);
        const prey = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId });
        const threat = spawnSnakeChain(state, { col: 10, row: 14 }, { segmentCount: 6, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: threat.chain.head.id, spawnGroupId: threat.chain.spawnGroupId });
        prey.chain.head.faction = "snake";
        threat.chain.head.faction = "snake";
        primeSnakeHeadVision(state, pack.head, getSnakeGameConfig().visionCone);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
    });
});
