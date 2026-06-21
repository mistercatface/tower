import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { FLOOR_CELL_KIND, floorBeltElbowTurn, isFloorBeltRailsKind } from "../Libraries/Spatial/grid/FloorCell.js";
import { planRailMazeCorridorBelts } from "../Libraries/Procedural/Mazes/railMazeCorridorBelts.js";
import { collectCorridorPathPolylines } from "../Libraries/Procedural/Mazes/collectCorridorPathPolylines.js";
import { bakeSnakeSplitLayoutPreview } from "../Libraries/Procedural/Mazes/snakeSplitLayout.js";
import { createWorkerNavigationService, syncWorkerNavigationTopology, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { validateBeltPathMouthAccess } from "../Libraries/Procedural/Mazes/railMazeBeltEndpoints.js";
import { gridSettings } from "../Config/world.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
describe("rail maze corridor belts", () => {
    it("collects corridor polylines on a T-junction fixture", () => {
        const cells = [
            { col: 1, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 1 },
            { col: 2, row: 1 },
        ];
        const layout = { originCol: 0, originRow: 0, strideCols: 4, cellCount: 12 };
        const memberSet = new Set(cells.map((c) => colRowToIndex(c.col, c.row, layout.strideCols)));
        const neighborAt = (col, row) => {
            const out = [];
            const candidates = [
                { col: col + 1, row },
                { col: col - 1, row },
                { col, row: row + 1 },
                { col, row: row - 1 },
            ];
            for (let i = 0; i < candidates.length; i++) {
                const n = candidates[i];
                if (memberSet.has(colRowToIndex(n.col, n.row, layout.strideCols))) out.push(n);
            }
            return out;
        };
        const paths = collectCorridorPathPolylines(cells, neighborAt, layout);
        assert.ok(paths.length >= 2);
        const armLengths = paths.map((path) => path.length);
        assert.ok(armLengths.some((len) => len >= 2));
    });
    it("rejects belt paths whose mouths are rail-blocked", async () => {
        const grid = new WorldObstacleGrid(gridSettings.cellSize);
        grid.rebuildFixed(0, 0, 5 * gridSettings.cellSize, 5 * gridSettings.cellSize);
        const navigation = createWorkerNavigationService(grid);
        for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) grid.grid[c + r * grid.cols] = 0;
        grid.stampCellEdge(2, 0, 2, 1, 1);
        await syncWorkerNavigationTopology(navigation, grid, { startCol: 1, endCol: 3, startRow: 0, endRow: 2 });
        const path = [
            { c: 2, r: 1 },
            { c: 2, r: 2 },
        ];
        assert.equal(validateBeltPathMouthAccess(grid, navigation.gridNavContext, path), false);
        grid.clearCellEdges(2, 0);
        await syncWorkerNavigationTopology(navigation, grid, { startCol: 1, endCol: 3, startRow: 0, endRow: 2 });
        assert.equal(validateBeltPathMouthAccess(grid, navigation.gridNavContext, path), true);
        terminateWorkerNavigation(navigation);
    });
    it("plans belt chains on snake split map samples", async () => {
        applySnakeGameConfig();
        const config = getSnakeGameConfig();
        const seeds = [11, 42, 256, 1337];
        for (let i = 0; i < seeds.length; i++) {
            const preview = await bakeSnakeSplitLayoutPreview({ mapSeed: seeds[i], playAreaCols: 64, playAreaRows: 64, cavern: config.cavern, rail: config.rail });
            const plan = preview.beltPlan;
            assert.ok(plan.pathCount >= 15, `seed ${seeds[i]}: only ${plan.pathCount} corridor paths`);
            for (let pi = 0; pi < plan.paths.length; pi++) {
                const len = plan.paths[pi].length;
                assert.ok(len >= 6 && len <= 24, `seed ${seeds[i]} path ${pi}: length ${len}`);
            }
            assert.ok(plan.floorBelts.length > 60, `seed ${seeds[i]}: only ${plan.floorBelts.length} belts`);
            let elbows = 0;
            for (let bi = 0; bi < plan.floorBelts.length; bi++) if (floorBeltElbowTurn(plan.floorBelts[bi].kind)) elbows++;
            assert.ok(elbows > 0, `seed ${seeds[i]}: no elbow belts`);
            assert.equal(plan.validation.ok, true, `seed ${seeds[i]}: ${plan.validation.error}`);
        }
    });
    it("rolls open vs railed belt kind per cell", async () => {
        applySnakeGameConfig();
        const config = getSnakeGameConfig();
        const preview = await bakeSnakeSplitLayoutPreview({ mapSeed: 42, playAreaCols: 64, playAreaRows: 64, cavern: config.cavern, rail: config.rail });
        const baseArgs = {
            grid: preview.grid,
            gridNavContext: preview.gridNavContext,
            railConfig: preview.railConfig,
            northReserveRows: preview.layout.northReserveRows,
            walkableKeys: preview.walkableIndices,
            mapSeed: preview.layout.mapSeed,
        };
        const allRailed = planRailMazeCorridorBelts({ ...baseArgs, openBeltChance: 0 });
        for (let i = 0; i < allRailed.floorBelts.length; i++) assert.ok(isFloorBeltRailsKind(allRailed.floorBelts[i].kind));
        const allOpen = planRailMazeCorridorBelts({ ...baseArgs, openBeltChance: 1 });
        for (let i = 0; i < allOpen.floorBelts.length; i++) assert.ok(!isFloorBeltRailsKind(allOpen.floorBelts[i].kind));
        const mixed = planRailMazeCorridorBelts({ ...baseArgs, openBeltChance: 0.1 });
        let openCount = 0;
        for (let i = 0; i < mixed.floorBelts.length; i++) if (!isFloorBeltRailsKind(mixed.floorBelts[i].kind)) openCount++;
        assert.ok(openCount > 0, "expected some open belts at 10% per cell");
        assert.ok(openCount < mixed.floorBelts.length, "expected most belts to stay railed at 10% per cell");
    });
});
