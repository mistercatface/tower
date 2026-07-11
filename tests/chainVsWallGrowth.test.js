import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { growChainSegment, spawnLinkedBallChain } from "../Libraries/Sandbox/sandbox.js";
import { createSandboxKineticWorld } from "./harness/stateFactories.js";

const CHAIN_OPTIONS = {
    segmentCount: 3,
    spacing: 8.4,
    ballType: "ball",
    growDirX: 1,
    growDirY: 0,
    faction: "alpha",
};

function stampBlockedCell(grid, col, row) {
    grid.grid[worldIdxAtCell(grid, col, row)] = 1;
}

function createNarrowCorridorState() {
    const world = createSandboxKineticWorld(32, 16);
    const grid = world.obstacleGrid;
    for (let col = 4; col <= 27; col++) {
        stampBlockedCell(grid, col, 6);
        stampBlockedCell(grid, col, 8);
    }
    for (let col = 11; col <= 27; col++) stampBlockedCell(grid, col, 7);
    return world;
}

function segmentCenterInBlockedCell(state, prop) {
    const grid = state.obstacleGrid;
    const idx = grid.worldToIdx(prop.x, prop.y);
    return grid.grid[idx] !== 0;
}

function countSegmentsInBlockedCells(state, headId) {
    const ids = getConnectedBodyIds(state.kinetic, headId);
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
        const prop = state.entityRegistry.getLive(ids[i]);
        if (segmentCenterInBlockedCell(state, prop)) count++;
    }
    return count;
}

describe("chainVsWallGrowth (v1 accepted: tail clip on grow)", () => {
    it("v1 documents tail overlap when growth pushes segment centers into blocked corridor cells", () => {
        const state = createNarrowCorridorState();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid, 5, 7), CHAIN_OPTIONS);
        let tail = chain.tail;
        const growCount = 10;
        for (let i = 0; i < growCount; i++) tail = growChainSegment(state, tail, CHAIN_OPTIONS);
        assert.equal(getConnectedBodyIds(state.kinetic, chain.head.id).length, CHAIN_OPTIONS.segmentCount + growCount);
        assert.ok(segmentCenterInBlockedCell(state, tail), "tail center should land in a blocked east-cap cell in this fixture");
        assert.ok(countSegmentsInBlockedCells(state, chain.head.id) >= 1);
    });
});
