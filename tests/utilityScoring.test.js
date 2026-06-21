import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { netScoreDetail, pickBestScoreKey, scoreCandidateSet } from "../Libraries/AI/utility/utilityScoring.js";

describe("utility scoring", () => {
    it("computes net score details from value, reach, and cost", () => {
        assert.deepEqual(netScoreDetail(120, 3, 10), { value: 120, reach: 3, cost: 30, net: 90 });
        assert.deepEqual(netScoreDetail(50, null, 10), { value: 50, reach: null, cost: 0, net: 50 });
    });

    it("keeps numeric score maps and details together", () => {
        const scored = scoreCandidateSet(
            {
                flee: { net: -Infinity },
                eat: { value: 100, reach: 2, cost: 20, net: 80 },
                explore: { value: 30, reach: null, cost: 0, net: 30 },
            },
            ["flee", "eat", "explore"]
        );
        assert.deepEqual(scored.candidateScores, { flee: -Infinity, eat: 80, explore: 30 });
        assert.equal(scored.chosenKey, "eat");
        assert.equal(scored.chosenScore, 80);
    });

    it("uses order as the tie breaker", () => {
        assert.deepEqual(pickBestScoreKey({ a: 10, b: 10 }, ["a", "b"]), { chosenKey: "a", chosenScore: 10 });
    });
});
