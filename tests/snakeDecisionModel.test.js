import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { SNAKE_HUNGRY_EXPLORE_TINT, SNAKE_INTENT_MODE_TINT, SNAKE_SATISFIED_EXPLORE_TINT, resolveSnakeChainTintHex } from "../Libraries/Game/snake/snakeChainColor.js";
import { buildSnakeDecisionContext, createSnakeDecisionBlackboard, deriveSnakeHungerState, deriveSnakeThreatState, deriveSprintIntent, pickSnakeIntentPolicy, scoreSnakeIntentCandidates } from "../Libraries/Game/snake/snakeDecisionModel.js";
function world({ threat = null, prey = null, food = null, threatDist = null, preyDist = null, foodDist = null } = {}) {
    return { threat, prey, food, threatDist, preyDist, foodDist };
}
function snake(id, extra = {}) {
    return { id, x: 0, y: 0, isDead: false, ...extra };
}
function context(visibleWorld, opts = {}) {
    return buildSnakeDecisionContext({ visibleWorld, ...opts });
}
describe("snake hunger facts (PR1)", () => {
    it("derives satisfied/hungry/desperate from food fraction", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        assert.equal(deriveSnakeHungerState(1).state, "satisfied");
        assert.equal(deriveSnakeHungerState(0.66).state, "satisfied");
        assert.equal(deriveSnakeHungerState(0.5).state, "hungry");
        assert.equal(deriveSnakeHungerState(0.33).state, "hungry");
        assert.equal(deriveSnakeHungerState(0.1).state, "desperate");
    });
    it("returns null hunger state when no fraction is provided", () => {
        assert.equal(deriveSnakeHungerState(null), null);
        const { decisionSnapshot } = context(world({ food: snake(7) }));
        assert.equal(decisionSnapshot.hungerState, null);
    });
    it("exposes hunger facts on the decision snapshot", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ food: snake(3) }), { foodFraction: 0.9 });
        assert.equal(decisionSnapshot.hungerState.state, "satisfied");
        assert.equal(decisionSnapshot.hungerState.satisfied, true);
        assert.equal(decisionSnapshot.hungerState.foodFraction, 0.9);
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
});
describe("snake intent scoring parity (PR2)", () => {
    it("scored policy prefers shard food over prey while preserving threat and explore ordering", () => {
        applySnakeGameConfig({ decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 } });
        const cases = [
            { in: world({ threat: snake(1), prey: snake(2), food: snake(3) }), mode: "flee" },
            { in: world({ prey: snake(2), food: snake(3) }), mode: "seek_food" },
            { in: world({ food: snake(3) }), mode: "seek_food" },
            { in: world(), mode: "explore" },
        ];
        for (const c of cases) {
            const bb = createSnakeDecisionBlackboard({ visibleWorld: c.in });
            assert.equal(pickSnakeIntentPolicy(bb).mode, c.mode);
        }
    });
    it("stores candidate scores and chosen reason on the snapshot", () => {
        applySnakeGameConfig({ decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 } });
        const { decisionSnapshot } = context(world({ food: snake(9) }));
        assert.deepEqual(decisionSnapshot.candidateScores, { flee: -Infinity, seek_prey: -Infinity, seek_food: 340, seek_ally: -Infinity, explore: 100 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
        assert.equal(decisionSnapshot.chosenReason, null);
    });
    it("absent candidates score -Infinity so explore wins by default", () => {
        const scores = scoreSnakeIntentCandidates(createSnakeDecisionBlackboard({ visibleWorld: world() }));
        assert.equal(scores.flee, -Infinity);
        assert.equal(scores.seek_prey, -Infinity);
        assert.equal(scores.seek_food, -Infinity);
        assert.equal(scores.seek_ally, -Infinity);
        assert.ok(Number.isFinite(scores.explore));
    });
    it("keeps memory reasons for remembered targets", () => {
        const bb = createSnakeDecisionBlackboard({ visibleWorld: world(), memoryWorld: { prey: snake(5) }, memorySource: { prey: true } });
        const policy = pickSnakeIntentPolicy(bb);
        assert.equal(policy.mode, "seek_prey");
        assert.equal(policy.reason, "prey_memory");
    });
});
describe("satisfied snakes weigh prey effort", () => {
    it("a satisfied snake grabs adjacent visible prey", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(2), preyDist: 1 }), { foodFraction: 0.9 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_prey");
        assert.equal(decisionSnapshot.candidateScoreDetails.seek_prey.reach, 1);
        assert.equal(decisionSnapshot.candidateScoreDetails.seek_prey.cost, 25);
    });
    it("a satisfied snake explores instead of chasing far visible prey", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(2, { type: "snake_head", faction: "red" }), preyDist: 2 }), { foodFraction: 0.9, seekerFaction: "red" });
        assert.equal(decisionSnapshot.chosenIntent.mode, "explore");
        assert.equal(decisionSnapshot.candidateScoreDetails.seek_prey.net, 90);
    });
    it("a satisfied snake still attacks an opposite-team snake prey", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(2, { type: "snake_head", faction: "blue" }), preyDist: 8 }), { foodFraction: 0.9, seekerFaction: "red" });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_prey");
        assert.ok(decisionSnapshot.candidateScores.seek_prey > 1000);
    });
    it("a hungry snake still chases prey", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(2, { type: "snake_head", faction: "blue" }), preyDist: 6 }), { foodFraction: 0.4, seekerFaction: "red" });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_prey");
    });
    it("a satisfied snake still flees a larger threat", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ threat: snake(1), prey: snake(2) }), { foodFraction: 1 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "flee");
    });
    it("a satisfied snake still seeks food over exploring", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.9 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
});
describe("committed target effort uses route length", () => {
    it("a satisfied snake abandons a lengthening chase while a desperate snake sustains it", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const prey = snake(2);
        const committedTarget = { mode: "seek_prey", targetId: prey.id };
        const routeStatus = { pathLen: 6 };
        const full = context(world({ prey, preyDist: 1 }), { foodFraction: 0.9, committedTarget, routeStatus });
        const desperate = context(world({ prey, preyDist: 1 }), { foodFraction: 0.1, committedTarget, routeStatus });
        assert.equal(full.decisionSnapshot.candidateScoreDetails.seek_prey.reach, 6);
        assert.equal(full.decisionSnapshot.chosenIntent.mode, "explore");
        assert.equal(desperate.decisionSnapshot.chosenIntent.mode, "seek_prey");
    });
    it("surfaces effort fields on the decision snapshot", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ food: snake(3), foodDist: 4 }), { foodFraction: 0.5 });
        assert.deepEqual(decisionSnapshot.candidateScoreDetails.seek_food, { value: 490, reach: 4, cost: 80, net: 410 });
        assert.equal(decisionSnapshot.candidateScores.seek_food, 410);
    });
});
describe("threat severity facts (PR6)", () => {
    it("derives severity from distance and flags lethal range", () => {
        applySnakeGameConfig({ fleeRange: 128, lethalThreatRange: 48 });
        assert.equal(deriveSnakeThreatState(null, 10), null);
        assert.equal(deriveSnakeThreatState(snake(1), null), null);
        assert.equal(deriveSnakeThreatState(snake(1), 64).severity, 0.5);
        assert.equal(deriveSnakeThreatState(snake(1), 128).severity, 0);
        assert.equal(deriveSnakeThreatState(snake(1), 30).lethal, true);
        assert.equal(deriveSnakeThreatState(snake(1), 64).lethal, false);
    });
    it("surfaces threatState on the snapshot without changing the chosen mode", () => {
        applySnakeGameConfig({ fleeRange: 128, lethalThreatRange: 48, decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 } });
        const { decisionSnapshot } = context(world({ threat: snake(1), food: snake(2), threatDist: 64 }));
        assert.equal(decisionSnapshot.threatState.severity, 0.5);
        assert.equal(decisionSnapshot.chosenIntent.mode, "flee");
    });
});
function applyScoringConfig() {
    applySnakeGameConfig({
        hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 },
        decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 },
        decisionPressure: { foodHungerBonus: 300, preyDesperationBonus: 250 },
    });
}
describe("hunger pressure and route-awareness (PR5)", () => {
    it("raises the food score as the snake gets hungrier", () => {
        applyScoringConfig();
        const full = context(world({ food: snake(1) }), { foodFraction: 1 });
        const empty = context(world({ food: snake(1) }), { foodFraction: 0.1 });
        assert.ok(empty.decisionSnapshot.candidateScores.seek_food > full.decisionSnapshot.candidateScores.seek_food);
    });
    it("a desperate snake hunts prey when no food is known", () => {
        applyScoringConfig();
        const { decisionSnapshot } = context(world({ prey: snake(2) }), { foodFraction: 0.1 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_prey");
    });
    it("a desperate snake hunts prey when its route to food recently failed", () => {
        applyScoringConfig();
        const { decisionSnapshot } = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.1, routeStatus: { routeFailed: true } });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_prey");
    });
    it("a desperate snake with reachable food eats instead of hunting", () => {
        applyScoringConfig();
        const { decisionSnapshot } = context(world({ prey: snake(2), food: snake(3), preyDist: 50, foodDist: 1 }), { foodFraction: 0.1, routeStatus: { routeFailed: false } });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
    it("a merely hungry snake prefers reachable shard food over prey", () => {
        applyScoringConfig();
        const { decisionSnapshot } = context(world({ prey: snake(2), food: snake(3), preyDist: 1, foodDist: 1 }), { foodFraction: 0.5, routeStatus: { routeFailed: false } });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
});
function applyRiskConfig() {
    applySnakeGameConfig({
        fleeRange: 128,
        lethalThreatRange: 48,
        hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 },
        decisionWeights: { flee: 400, prey: 300, food: 340, explore: 100 },
        decisionPressure: { foodHungerBonus: 300, preyDesperationBonus: 250, riskTolerance: { satisfied: 0, hungry: 0.4, desperate: 0.75 } },
    });
}
describe("hunger overrides flee for food (PR7)", () => {
    it("a well-fed snake flees a mid-range threat instead of grabbing food", () => {
        applyRiskConfig();
        const { decisionSnapshot } = context(world({ threat: snake(1), food: snake(2), threatDist: 80 }), { foodFraction: 1 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "flee");
    });
    it("a hungry snake risks a mid-range threat to reach food", () => {
        applyRiskConfig();
        const { decisionSnapshot } = context(world({ threat: snake(1), food: snake(2), threatDist: 80 }), { foodFraction: 0.5 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
    it("a desperate snake risks the threat even harder", () => {
        applyRiskConfig();
        const { decisionSnapshot } = context(world({ threat: snake(1), food: snake(2), threatDist: 80 }), { foodFraction: 0.1 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
    it("a lethal-range threat always forces flee, even when desperate", () => {
        applyRiskConfig();
        const { decisionSnapshot } = context(world({ threat: snake(1), food: snake(2), threatDist: 30 }), { foodFraction: 0.1 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "flee");
    });
    it("with no hunger info the snake still hard-flees any visible threat", () => {
        applyRiskConfig();
        const { decisionSnapshot } = context(world({ threat: snake(1), food: snake(2), threatDist: 80 }));
        assert.equal(decisionSnapshot.chosenIntent.mode, "flee");
    });
});
describe("hunger appearance is a condition (PR4)", () => {
    it("explore + satisfied resolves to purple", () => {
        assert.equal(resolveSnakeChainTintHex("explore", { satisfied: true }), SNAKE_SATISFIED_EXPLORE_TINT);
    });
    it("explore + hungry resolves to orange", () => {
        assert.equal(resolveSnakeChainTintHex("explore", { satisfied: false, hungry: true }), SNAKE_HUNGRY_EXPLORE_TINT);
    });
    it("explore + desperate also reads as the hungry orange tint", () => {
        assert.equal(resolveSnakeChainTintHex("explore", { satisfied: false, desperate: true }), SNAKE_HUNGRY_EXPLORE_TINT);
    });
    it("explore with no hunger info stays the normal explore tint", () => {
        assert.equal(resolveSnakeChainTintHex("explore", null), SNAKE_INTENT_MODE_TINT.explore);
    });
    it("flee/seek_food/seek_prey override hunger with their mode tint", () => {
        assert.equal(resolveSnakeChainTintHex("flee", { satisfied: true }), SNAKE_INTENT_MODE_TINT.flee);
        assert.equal(resolveSnakeChainTintHex("seek_food", { hungry: true }), SNAKE_INTENT_MODE_TINT.seek_food);
        assert.equal(resolveSnakeChainTintHex("seek_prey", { desperate: true }), SNAKE_INTENT_MODE_TINT.seek_prey);
    });
});
describe("sprint intent facts (PR9)", () => {
    it("sprints to escape a severe or lethal flee threat", () => {
        applySnakeGameConfig({ sprint: { fleeSeverity: 0.5, speedMultiplier: 1.4, accelMultiplier: 1.4, hungerDrainMultiplier: 2.5 } });
        assert.deepEqual(deriveSprintIntent("flee", { severity: 0.8, lethal: false }), { want: true, reason: "escape" });
        assert.deepEqual(deriveSprintIntent("flee", { severity: 0.1, lethal: true }), { want: true, reason: "escape" });
    });
    it("does not sprint from a mild flee threat", () => {
        assert.equal(deriveSprintIntent("flee", { severity: 0.2, lethal: false }).want, false);
    });
    it("sprints to chase prey", () => {
        assert.deepEqual(deriveSprintIntent("seek_prey", null), { want: true, reason: "chase" });
    });
    it("sprints to grab food under a serious non-lethal threat", () => {
        applySnakeGameConfig({ sprint: { fleeSeverity: 0.5, speedMultiplier: 1.4, accelMultiplier: 1.4, hungerDrainMultiplier: 2.5 } });
        assert.deepEqual(deriveSprintIntent("seek_food", { severity: 0.8, lethal: false }), { want: true, reason: "feed" });
    });
    it("does not sprint for safe food or exploring", () => {
        assert.equal(deriveSprintIntent("seek_food", null).want, false);
        assert.equal(deriveSprintIntent("explore", null).want, false);
    });
    it("surfaces sprintIntent on the decision snapshot", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(9) }), { foodFraction: 0.4 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_prey");
        assert.deepEqual(decisionSnapshot.sprintIntent, { want: true, reason: "chase" });
    });
});
describe("snake seek_ally cohesion (4c)", () => {
    function allyWorld(allyId = "ally1", allyDist = 4) {
        return {
            threat: null,
            prey: null,
            food: null,
            ally: snake(allyId, { type: "snake_head", faction: "red" }),
            allyDist,
            allyCount: 1,
            allyCentroid: { x: 64, y: 0 },
        };
    }
    it("seek_ally beats explore when satisfied, safe, and a small snake", () => {
        applySnakeGameConfig();
        const { decisionSnapshot } = context(allyWorld(), { foodFraction: 0.9, seekerSegmentCount: 3, seekerFaction: "red" });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_ally");
        assert.equal(decisionSnapshot.chosenIntent.targetId, "ally1");
        assert.ok(decisionSnapshot.candidateScores.seek_ally > decisionSnapshot.candidateScores.explore);
    });
    it("does not regroup when hungry or desperate", () => {
        applySnakeGameConfig();
        const hungry = context(allyWorld(), { foodFraction: 0.5, seekerSegmentCount: 3 });
        assert.equal(hungry.decisionSnapshot.chosenIntent.mode, "explore");
        const desperate = context(allyWorld(), { foodFraction: 0.1, seekerSegmentCount: 3 });
        assert.equal(desperate.decisionSnapshot.chosenIntent.mode, "explore");
    });
    it("scales regroup drive down for long snakes", () => {
        applySnakeGameConfig({ factionCohesion: { referenceSegmentCount: 3, maxSegmentScale: 10 } });
        const small = context(allyWorld(), { foodFraction: 0.9, seekerSegmentCount: 3 });
        assert.equal(small.decisionSnapshot.chosenIntent.mode, "seek_ally");
        const large = context(allyWorld(), { foodFraction: 0.9, seekerSegmentCount: 10 });
        assert.equal(large.decisionSnapshot.chosenIntent.mode, "explore");
    });
    it("prefers food over regroup when both are visible", () => {
        applySnakeGameConfig();
        const { decisionSnapshot } = context({ ...allyWorld(), food: snake(7) }, { foodFraction: 0.9, seekerSegmentCount: 3 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
    it("does not regroup when already within ideal stop distance", () => {
        applySnakeGameConfig({ factionCohesion: { idealStopDist: 3 } });
        const { decisionSnapshot } = context(allyWorld("ally1", 2), { foodFraction: 0.9, seekerSegmentCount: 3 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "explore");
    });
});
