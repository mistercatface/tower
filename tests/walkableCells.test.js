import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Spatial/spatial.js";
import { createNavWalkableTestState } from "./harness/stateFactories.js";
import { getNavWalkableCellIndex, patchNavWalkableCellIndex, isNavWalkableCell } from "../Libraries/Navigation/navigation.js";
import { terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { bumpGridNavEpoch } from "../Libraries/Spatial/spatial.js";
import { GRID_NAV_EPOCH_WALL } from "../Core/engineEnums.js";

async function createWalkableCellsTestState(config) {
    return createNavWalkableTestState(config);
}

function pickWalkableCell(openCells, excludeIndices = null, rng = Math.random) {
    const candidates = excludeIndices ? openCells.filter((idx) => !excludeIndices.has(idx)) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}

function pickNavWalkableCell(state, rng = Math.random, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null, excludeIndices = null) {
    const cells = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).cells;
    return pickWalkableCell(cells, excludeIndices, rng);
}

describe("walkableCells", () => {
    it("getNavWalkableCellIndex skips blocked grid cells inside bounds", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        const blockedCol = 3;
        const blockedRow = 4;
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,blockedCol, blockedRow)] = 1;
        const index = getNavWalkableCellIndex(state);
        assert.ok(index.cells.length > 0);
        assert.equal(index.flags[worldIdxAtCell(state.obstacleGrid, blockedCol, blockedRow)], 0);
        terminateWorkerNavigation(state.nav);
    });
    it("getNavWalkableCellIndex skips blocked voxels", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,3, 3)] = 1;
        getNavWalkableCellIndex(state);
        assert.equal(getNavWalkableCellIndex(state).flags[worldIdxAtCell(state.obstacleGrid,3, 3)], 0);
        terminateWorkerNavigation(state.nav);
    });
    it("getNavWalkableCellIndex rebakes when navigation epoch changes", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        getNavWalkableCellIndex(state);
        const before = getNavWalkableCellIndex(state).cells.length;
        state.obstacleGrid.grid[worldIdxAtCell(state.obstacleGrid,2, 2)] = 1;
        bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH_WALL);
        await state.nav.commitEdit({ startCol: 2, endCol: 2, startRow: 2, endRow: 2 });
        getNavWalkableCellIndex(state);
        assert.ok(getNavWalkableCellIndex(state).cells.length <= before);
        assert.equal(getNavWalkableCellIndex(state).flags[worldIdxAtCell(state.obstacleGrid,2, 2)], 0);
        terminateWorkerNavigation(state.nav);
    });
    it("stores nav-walkable cells in a dense flag grid", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        const index = getNavWalkableCellIndex(state, config);
        assert.ok(index.flags instanceof Uint8Array);
        assert.equal(index.flags.length, state.obstacleGrid.cols * state.obstacleGrid.rows);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(index.flags[picked] !== 0);
        terminateWorkerNavigation(state.nav);
    });
    it("patchNavWalkableCellIndex rebakes cached bounds after obstacle epoch bump", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        getNavWalkableCellIndex(state);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(picked !== null && picked !== undefined);
        const idx = picked;
        state.obstacleGrid.grid[idx] = 1;
        bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH_WALL);
        await state.nav.commitEdit(idx);
        patchNavWalkableCellIndex(state, idx);
        assert.ok(getNavWalkableCellIndex(state).flags[picked] === 0);
        terminateWorkerNavigation(state.nav);
    });
    it("pickNavWalkableCell only returns baked nav-walkable cells", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 8;
        config.boundsRows = 8;
        const state = await createWalkableCellsTestState(config);
        getNavWalkableCellIndex(state);
        const picked = pickNavWalkableCell(state, () => 0);
        assert.ok(picked !== null && picked !== undefined);
        assert.ok(getNavWalkableCellIndex(state).flags[picked] !== 0);
        assert.ok(isNavWalkableCell(state.obstacleGrid, state.nav.topology, picked));
        terminateWorkerNavigation(state.nav);
    });
    it("pickWalkableCell respects exclude indices", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 8 * 16, 8 * 16);
        const cells = [
            worldIdxAtCell(grid, 1, 1),
            worldIdxAtCell(grid, 2, 2),
            worldIdxAtCell(grid, 3, 3),
        ];
        const excludeIndices = new Set([worldIdxAtCell(grid, 2, 2)]);
        const picked = pickWalkableCell(cells, excludeIndices, () => 0.9);
        assert.equal(picked, worldIdxAtCell(grid, 3, 3));
    });
    it("pickNavWalkableCell returns null when every cell is excluded", async () => {
        const config = createDefaultMapGenBoundsConfig();
        config.boundsIdx = 0;
        config.boundsCols = 4;
        config.boundsRows = 4;
        const state = await createWalkableCellsTestState(config);
        const open = getNavWalkableCellIndex(state).cells;
        const excludeIndices = new Set(open);
        assert.equal(pickNavWalkableCell(state, Math.random, config, null, excludeIndices), null);
        terminateWorkerNavigation(state.nav);
    });
});
