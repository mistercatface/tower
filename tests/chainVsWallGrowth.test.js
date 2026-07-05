import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { colRowToIndex } from "./harness/testGridUtils.js";
import { resetKineticConstraintIds } from "../Libraries/Physics/physics.js";
import { getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { growChainSegment, spawnLinkedBallChain } from "../Libraries/Sandbox/sandbox.js";

const CHAIN_OPTIONS = {
    segmentCount: 3,
    spacing: 8.4,
    ballType: "ball",
    growDirX: 1,
    growDirY: 0,
};

function stampBlockedCell(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}

function createNarrowCorridorState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 16 * 16);
    for (let col = 4; col <= 27; col++) {
        stampBlockedCell(grid, col, 6);
        stampBlockedCell(grid, col, 8);
    }
    for (let col = 11; col <= 27; col++) stampBlockedCell(grid, col, 7);
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
}

function segmentCenterInBlockedCell(state, prop) {
    const grid = state.obstacleGrid;
    const { col, row } = grid.worldToGrid(prop.x, prop.y);
    return grid.grid[colRowToIndex(col, row, grid.cols)] !== 0;
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
        resetKineticConstraintIds(1);
        const state = createNarrowCorridorState();
        const chain = spawnLinkedBallChain(state, colRowToIndex(5, 7, state.obstacleGrid.cols), CHAIN_OPTIONS);
        let tail = chain.tail;
        const growCount = 10;
        for (let i = 0; i < growCount; i++) tail = growChainSegment(state, tail, CHAIN_OPTIONS);
        assert.equal(getConnectedBodyIds(state.kinetic, chain.head.id).length, CHAIN_OPTIONS.segmentCount + growCount);
        assert.ok(segmentCenterInBlockedCell(state, tail), "tail center should land in a blocked east-cap cell in this fixture");
        assert.ok(countSegmentsInBlockedCells(state, chain.head.id) >= 1);
    });
});
