import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { FLOOR_CELL_KIND, floorBeltElbowTurn } from "../Libraries/Spatial/grid/FloorCell.js";
import { collectCorridorPathPolylines } from "../Libraries/Procedural/Mazes/collectCorridorPathPolylines.js";
import { bakeSnakeSplitLayoutPreview } from "../Libraries/Procedural/Mazes/snakeSplitLayout.js";
import { createTestNavigation, syncGridNavContext } from "../Libraries/Navigation/GridNavContext.js";
import { validateBeltPathMouthAccess } from "../Libraries/Procedural/Mazes/railMazeBeltEndpoints.js";
import { gridSettings } from "../Config/world.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";

describe("rail maze corridor belts", () => {
    it("collects corridor polylines on a T-junction fixture", () => {
        const cells = [
            { col: 1, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 1 },
            { col: 2, row: 1 },
        ];
        const memberSet = new Set(cells.map((c) => `${c.col},${c.row}`));
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
                if (memberSet.has(`${n.col},${n.row}`)) out.push(n);
            }
            return out;
        };
        const paths = collectCorridorPathPolylines(cells, neighborAt);
        assert.ok(paths.length >= 2);
        const armLengths = paths.map((path) => path.length);
        assert.ok(armLengths.some((len) => len >= 2));
    });

    it("rejects belt paths whose mouths are rail-blocked", () => {
        const grid = new WorldObstacleGrid(gridSettings.cellSize);
        grid.rebuildFixed(0, 0, 5 * gridSettings.cellSize, 5 * gridSettings.cellSize);
        const navigation = createTestNavigation(grid);
        for (let c = 0; c < 5; c++)
            for (let r = 0; r < 5; r++) grid.grid[c + r * grid.cols] = 0;
        grid.stampCellEdge(2, 0, 2, 1, 1);
        syncGridNavContext(navigation.gridNavContext, grid);
        const path = [
            { c: 2, r: 1 },
            { c: 2, r: 2 },
        ];
        assert.equal(validateBeltPathMouthAccess(grid, navigation.gridNavContext, path), false);
        grid.clearCellEdges(2, 0);
        syncGridNavContext(navigation.gridNavContext, grid);
        assert.equal(validateBeltPathMouthAccess(grid, navigation.gridNavContext, path), true);
    });

    it("plans belt chains on snake split map samples", () => {
        applySnakeGameConfig();
        const config = getSnakeGameConfig();
        const seeds = [11, 42, 256, 1337];
        for (let i = 0; i < seeds.length; i++) {
            const preview = bakeSnakeSplitLayoutPreview({
                mapSeed: seeds[i],
                playAreaCols: 64,
                playAreaRows: 64,
                cavern: config.cavern,
                rail: config.rail,
            });
            const plan = preview.beltPlan;
            assert.ok(plan.pathCount >= 5, `seed ${seeds[i]}: only ${plan.pathCount} corridor paths`);
            assert.ok(plan.floorBelts.length > 20, `seed ${seeds[i]}: only ${plan.floorBelts.length} belts`);
            let elbows = 0;
            for (let bi = 0; bi < plan.floorBelts.length; bi++) {
                if (floorBeltElbowTurn(plan.floorBelts[bi].kind)) elbows++;
            }
            assert.ok(elbows > 0, `seed ${seeds[i]}: no elbow belts`);
            assert.equal(plan.validation.ok, true, `seed ${seeds[i]}: ${plan.validation.error}`);
        }
    });

    it("uses railed belt kinds only", () => {
        applySnakeGameConfig();
        const preview = bakeSnakeSplitLayoutPreview({
            mapSeed: 42,
            playAreaCols: 64,
            playAreaRows: 64,
            cavern: getSnakeGameConfig().cavern,
            rail: getSnakeGameConfig().rail,
        });
        for (let i = 0; i < preview.beltPlan.floorBelts.length; i++) {
            const kind = preview.beltPlan.floorBelts[i].kind;
            assert.ok(kind >= FLOOR_CELL_KIND.BeltRails && kind <= FLOOR_CELL_KIND.BeltElbowRightRails);
        }
    });
});
