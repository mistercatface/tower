import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { SNAKE_HUNGRY_EXPLORE_TINT, SNAKE_INTENT_MODE_TINT, SNAKE_SATISFIED_EXPLORE_TINT, resolveSnakeChainTintHex } from "../Libraries/Game/snake/snakeChainColor.js";
import { buildSnakeDecisionContext, createSnakeDecisionBlackboard, deriveSnakeHungerState, pickSnakeIntentPolicy, scoreSnakeIntentCandidates } from "../Libraries/Game/snake/snakeDecisionModel.js";
function world({ threat = null, prey = null, food = null } = {}) {
    return { threat, prey, food };
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
    it("scored policy reproduces the legacy threat>prey>food>explore cascade", () => {
        applySnakeGameConfig({ decisionWeights: { flee: 400, prey: 300, food: 200, explore: 100 } });
        const cases = [
            { in: world({ threat: snake(1), prey: snake(2), food: snake(3) }), mode: "flee" },
            { in: world({ prey: snake(2), food: snake(3) }), mode: "seek_prey" },
            { in: world({ food: snake(3) }), mode: "seek_food" },
            { in: world(), mode: "explore" },
        ];
        for (const c of cases) {
            const bb = createSnakeDecisionBlackboard({ visibleWorld: c.in });
            assert.equal(pickSnakeIntentPolicy(bb).mode, c.mode);
        }
    });
    it("stores candidate scores and chosen reason on the snapshot", () => {
        applySnakeGameConfig({ decisionWeights: { flee: 400, prey: 300, food: 200, explore: 100 } });
        const { decisionSnapshot } = context(world({ food: snake(9) }));
        assert.deepEqual(decisionSnapshot.candidateScores, { flee: -Infinity, seek_prey: -Infinity, seek_food: 200, explore: 100 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
        assert.equal(decisionSnapshot.chosenReason, null);
    });
    it("absent candidates score -Infinity so explore wins by default", () => {
        const scores = scoreSnakeIntentCandidates(createSnakeDecisionBlackboard({ visibleWorld: world() }));
        assert.equal(scores.flee, -Infinity);
        assert.equal(scores.seek_prey, -Infinity);
        assert.equal(scores.seek_food, -Infinity);
        assert.ok(Number.isFinite(scores.explore));
    });
    it("keeps memory reasons for remembered targets", () => {
        const bb = createSnakeDecisionBlackboard({
            visibleWorld: world(),
            memoryWorld: { prey: snake(5) },
            memorySource: { prey: true },
        });
        const policy = pickSnakeIntentPolicy(bb);
        assert.equal(policy.mode, "seek_prey");
        assert.equal(policy.reason, "prey_memory");
    });
});
describe("satisfied snakes ignore prey (PR3)", () => {
    it("a satisfied snake explores instead of chasing visible prey", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(2) }), { foodFraction: 0.9 });
        assert.equal(decisionSnapshot.chosenIntent.mode, "explore");
        assert.equal(decisionSnapshot.candidateScores.seek_prey, -Infinity);
    });
    it("a hungry snake still chases prey", () => {
        applySnakeGameConfig({ hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 } });
        const { decisionSnapshot } = context(world({ prey: snake(2) }), { foodFraction: 0.4 });
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
function applyScoringConfig() {
    applySnakeGameConfig({
        hunger: { satisfiedAtOrAbove: 0.66, desperateBelow: 0.33 },
        decisionWeights: { flee: 400, prey: 300, food: 200, explore: 100 },
        decisionPressure: { foodHungerBonus: 120, preyDesperationBonus: 250 },
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
        const { decisionSnapshot } = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.1, routeStatus: { routeFailed: false } });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_food");
    });
    it("a merely hungry snake still prefers prey over reachable food", () => {
        applyScoringConfig();
        const { decisionSnapshot } = context(world({ prey: snake(2), food: snake(3) }), { foodFraction: 0.5, routeStatus: { routeFailed: false } });
        assert.equal(decisionSnapshot.chosenIntent.mode, "seek_prey");
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
