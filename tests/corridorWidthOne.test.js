import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertBundleLanes, assertManySeparateLinks, generateWidthOneFixtures, makeHorizontalFixture, maxLanesForFixture, solveTwoRoomBundle } from "./corridorHarness.js";
const CORRIDOR_WIDTH = 1;
describe("width-1 corridors reach room interiors", () => {
    const spotFixtures = [
        makeHorizontalFixture(8, 8, 8, 8, 8),
        makeHorizontalFixture(4, 12, 2, 12, 4),
        makeHorizontalFixture(12, 4, 16, 4, 12),
        makeHorizontalFixture(8, 8, 2, 12, 8),
        makeHorizontalFixture(8, 8, 2, 12, 12),
    ];
    for (const fixture of spotFixtures)
        for (let laneCount = 1; laneCount <= 4; laneCount++)
            it(`${fixture.name}: ${laneCount} lane(s)`, () => {
                const maxLanes = maxLanesForFixture(fixture, CORRIDOR_WIDTH);
                if (laneCount > maxLanes) return;
                let solved = 0;
                for (let seed = 0; seed < 50; seed++) {
                    const bundle = solveTwoRoomBundle(fixture, laneCount, CORRIDOR_WIDTH, seed, false);
                    if (!bundle) continue;
                    assert.equal(bundle.paths.length, laneCount);
                    assertBundleLanes(fixture, bundle, false);
                    solved++;
                }
                assert.ok(solved > 0, `no seed solved ${laneCount} lanes for ${fixture.name}`);
            });
    it("100 seeds x 2 lanes on default horizontal layout", () => {
        const fixture = makeHorizontalFixture(8, 8, 8, 8, 8);
        const failures = [];
        for (let seed = 0; seed < 100; seed++) {
            const bundle = solveTwoRoomBundle(fixture, 2, CORRIDOR_WIDTH, seed, false);
            if (!bundle) {
                failures.push({ seed, phase: "solve" });
                continue;
            }
            try {
                assertBundleLanes(fixture, bundle, false);
            } catch (err) {
                failures.push({ seed, phase: "belts", message: err.message });
            }
        }
        assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 5), null, 2));
    });
    it("12 separate width-1 links use any wall edge when facing wall fills up", () => {
        assertManySeparateLinks(makeHorizontalFixture(8, 8, 8, 8, 8), 12);
        assertManySeparateLinks(makeHorizontalFixture(8, 8, 2, 12, 8), 12);
    });
});
describe("width-1 corridors across room sizes and gaps", () => {
    const fixtures = generateWidthOneFixtures();
    for (const fixture of fixtures) {
        const maxLanes = maxLanesForFixture(fixture, CORRIDOR_WIDTH);
        const laneCounts = [1, maxLanes];
        const uniqueLaneCounts = [...new Set(laneCounts.map((n) => Math.min(n, 4)))];
        for (const laneCount of uniqueLaneCounts)
            it(`${fixture.name}: ${laneCount} lane(s)`, () => {
                let solved = 0;
                for (let seed = 0; seed < 8; seed++) {
                    const bundle = solveTwoRoomBundle(fixture, laneCount, CORRIDOR_WIDTH, seed, false);
                    if (!bundle) continue;
                    assertBundleLanes(fixture, bundle, false);
                    solved++;
                }
                assert.ok(solved > 0, `no seed solved ${laneCount} lanes for ${fixture.name}`);
            });
    }
});
