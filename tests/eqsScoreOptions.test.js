import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreOptions } from "../Libraries/AI/eqs/scoreOptions.js";

describe("EQS score options", () => {
    it("scores options with weighted tests and picks the best", () => {
        const result = scoreOptions(
            [{ id: "near", dist: 2 }, { id: "far", dist: 6 }],
            [
                { id: "base", score: () => 10 },
                { id: "distance", weight: 2, score: (option) => option.dist },
            ]
        );
        assert.equal(result.best.id, "far");
        assert.deepEqual(result.scoredOptions.map((entry) => entry.score), [14, 22]);
        assert.deepEqual(result.scoredOptions[1].testScores, { base: 10, distance: 6 });
    });

    it("rejects options with -Infinity test scores", () => {
        const result = scoreOptions(
            [{ id: "bad" }, { id: "good" }],
            [{ id: "valid", score: (option) => (option.id === "bad" ? -Infinity : 1) }]
        );
        assert.equal(result.best.id, "good");
        assert.equal(result.scoredOptions[0].score, -Infinity);
    });
});
