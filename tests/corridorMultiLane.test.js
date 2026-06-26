import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeHorizontalFixture, assertBundleLanes, maxLanesForFixture, solveTwoRoomBundle } from "./corridorHarness.js";
const SEEDS = [1, 7, 42, 99, 1234, 9001];
describe("corridor width 2 (wide footprint corners)", () => {
    const fixture = makeHorizontalFixture(8, 8, 8, 8, 8);
    const width = 2;
    const maxLanes = maxLanesForFixture(fixture, width);
    for (let laneCount = 1; laneCount <= Math.min(maxLanes, 4); laneCount++)
        it(`solves ${laneCount} lane(s) width ${width}`, () => {
            let solved = 0;
            for (const seed of SEEDS) {
                const bundle = solveTwoRoomBundle(fixture, laneCount, width, seed);
                if (!bundle) continue;
                assert.equal(bundle.paths.length, laneCount);
                assertBundleLanes(fixture, bundle);
                solved++;
            }
            assert.ok(solved > 0, `no seed solved ${laneCount} lanes width ${width}`);
        });
});
