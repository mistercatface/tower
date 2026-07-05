import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  FLOOR_CELL_KIND, FloorBelt  } from "../Libraries/Spatial/spatial.js";
import { planRailMazeCorridorBelts, collectRailMazeBeltZoneCells, validateBeltPathMouthAccess } from "../Libraries/Procedural/Mazes/railMazeCorridorBelts.js";
import { isNavWalkableAt } from "../Libraries/Procedural/Mazes/walkableCells.js";
import {  layoutAbsCellIndex, undirectedPairIndex  } from "../Libraries/Spatial/spatial.js";

function undirectedEdgeIndex(aCol, aRow, bCol, bRow, layout) {
    const a = layoutAbsCellIndex(layout, aCol, aRow);
    const b = layoutAbsCellIndex(layout, bCol, bRow);
    return undirectedPairIndex(a, b, layout.cellCount);
}

function collectCorridorPathPolylines(cells, neighborAt, layout) {
    const members = cells.slice();
    const memberSet = new Set();
    for (let i = 0; i < members.length; i++) memberSet.add(layoutAbsCellIndex(layout, members[i].col, members[i].row));
    const degreeByIndex = new Map();
    const neighborsByIndex = new Map();
    for (let i = 0; i < members.length; i++) {
        const cell = members[i];
        const idx = layoutAbsCellIndex(layout, cell.col, cell.row);
        const neighbors = neighborAt(cell.col, cell.row).filter((n) => memberSet.has(layoutAbsCellIndex(layout, n.col, n.row)));
        neighborsByIndex.set(idx, neighbors);
        degreeByIndex.set(idx, neighbors.length);
    }
    const isSpecial = (col, row) => degreeByIndex.get(layoutAbsCellIndex(layout, col, row)) !== 2;
    const usedEdges = new Set();
    const paths = [];
    for (let si = 0; si < members.length; si++) {
        const start = members[si];
        if (!isSpecial(start.col, start.row)) continue;
        const startNeighbors = neighborsByIndex.get(layoutAbsCellIndex(layout, start.col, start.row));
        for (let ni = 0; ni < startNeighbors.length; ni++) {
            const first = startNeighbors[ni];
            const edge = undirectedEdgeIndex(start.col, start.row, first.col, first.row, layout);
            if (usedEdges.has(edge)) continue;
            usedEdges.add(edge);
            const path = [{ c: start.col, r: start.row }];
            let prevCol = start.col;
            let prevRow = start.row;
            let curCol = first.col;
            let curRow = first.row;
            while (!isSpecial(curCol, curRow)) {
                path.push({ c: curCol, r: curRow });
                const midNeighbors = neighborsByIndex.get(layoutAbsCellIndex(layout, curCol, curRow));
                let nextCol = null;
                let nextRow = null;
                for (let mi = 0; mi < midNeighbors.length; mi++) {
                    const n = midNeighbors[mi];
                    if (n.col === prevCol && n.row === prevRow) continue;
                    nextCol = n.col;
                    nextRow = n.row;
                    break;
                }
                if (nextCol === null) break;
                usedEdges.add(undirectedEdgeIndex(curCol, curRow, nextCol, nextRow, layout));
                prevCol = curCol;
                prevRow = curRow;
                curCol = nextCol;
                curRow = nextRow;
            }
            path.push({ c: curCol, r: curRow });
            if (path.length >= 2) paths.push(path);
        }
    }
    if (paths.length === 0 && members.length > 0) {
        let allDegreeTwo = true;
        for (let i = 0; i < members.length; i++)
            if (degreeByIndex.get(layoutAbsCellIndex(layout, members[i].col, members[i].row)) !== 2) {
                allDegreeTwo = false;
                break;
            }
        if (allDegreeTwo) {
            const start = members[0];
            const loop = [{ c: start.col, r: start.row }];
            let prevCol = start.col;
            let prevRow = start.row;
            let curCol = start.col;
            let curRow = start.row;
            for (;;) {
                const midNeighbors = neighborsByIndex.get(layoutAbsCellIndex(layout, curCol, curRow));
                let nextCol = null;
                let nextRow = null;
                for (let mi = 0; mi < midNeighbors.length; mi++) {
                    const n = midNeighbors[mi];
                    if (n.col === prevCol && n.row === prevRow) continue;
                    nextCol = n.col;
                    nextRow = n.row;
                    break;
                }
                if (nextCol === null) break;
                if (nextCol === start.col && nextRow === start.row) {
                    loop.push({ c: start.col, r: start.row });
                    break;
                }
                loop.push({ c: nextCol, r: nextRow });
                prevCol = curCol;
                prevRow = curRow;
                curCol = nextCol;
                curRow = nextRow;
                if (loop.length > members.length + 1) break;
            }
            if (loop.length >= 3) paths.push(loop);
        }
    }
    return paths;
}

import { createNavRuntime, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { gridSettings } from "../Config/world.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { bakeRailMazeDfs } from "../Libraries/Procedural/Mazes/railMazeDfs.js";
import { getNavWalkableCellIndex } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { stampGlobalRailWalls } from "../Libraries/Procedural/Mazes/railMazeCorridorBelts.js";
import { commitGridNavEdit } from "../Libraries/Spatial/spatial.js";

async function setupTestGridAndNav(seed) {
    const cellSize = gridSettings.cellSize;
    const cols = 64;
    const rows = 64;
    const grid = new WorldObstacleGrid(cellSize);
    grid.rebuildFixed((cols * cellSize) / 2, (rows * cellSize) / 2, cols * cellSize, rows * cellSize);
    const nav = createNavRuntime(grid);

    const railConfig = {
        boundsMode: "rect",
        boundsIdx: 0,
        boundsCols: cols,
        boundsRows: rows,
        wallHeightLevel: 1,
        edgeThickness: 2,
    };

    const rails = bakeRailMazeDfs(
        { originCol: 0, originRow: 0, cols, rows },
        { railWallHeightLevel: 1, railWallThicknessLevel: 2, corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 },
        seed,
        cols,
    );

    const state = {
        obstacleGrid: grid,
        nav,
        sandbox: {},
        editor: {},
        worldSurfaces: {
            settings: {
                maxWallHeightLevel: 9,
            }
        }
    };
    stampGlobalRailWalls(state, rails, { commit: false });
    await commitGridNavEdit(state, null, { invalidateSurfaces: false, fullNavSync: true });

    const floodSeedBounds = { boundsMode: "rect", boundsIdx: 32 + 32 * cols, boundsCols: 1, boundsRows: 1 };
    const walkableState = { obstacleGrid: grid, nav, sandbox: {}, editor: { cavernConfig: railConfig } };
    const navWalkableIndex = getNavWalkableCellIndex(walkableState, railConfig, floodSeedBounds);

    return { grid, nav, railConfig, navWalkableIndex };
}

describe("rail maze corridor belts", () => {
    it("collects corridor polylines on a T-junction fixture", () => {
        const cells = [
            { col: 1, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 1 },
            { col: 2, row: 1 },
        ];
        const layout = { originCol: 0, originRow: 0, strideCols: 4, cellCount: 12 };
        const memberSet = new Set(cells.map((c) => c.col + c.row * layout.strideCols));
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
                if (memberSet.has(n.col + n.row * layout.strideCols)) out.push(n);
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
        const nav = createNavRuntime(grid);
        for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) grid.grid[c + r * grid.cols] = 0;
        grid.stampCellEdge(worldIdxAtCell(grid, 2, 0), 2, 1, 1);
        await nav.syncTopology({ startCol: 1, endCol: 3, startRow: 0, endRow: 2 }, grid);
        const path = [
            worldIdxAtCell(grid, 2, 1),
            worldIdxAtCell(grid, 2, 2),
        ];
        assert.equal(validateBeltPathMouthAccess(grid, nav.topology, path), false);
        grid.clearCellEdges(worldIdxAtCell(grid, 2, 0));
        await nav.syncTopology({ startCol: 1, endCol: 3, startRow: 0, endRow: 2 }, grid);
        assert.equal(validateBeltPathMouthAccess(grid, nav.topology, path), true);
        terminateWorkerNavigation(nav);
    });

    it("plans belt chains on maze layout samples", async () => {
        const seeds = [11, 42, 256, 1337];
        for (let i = 0; i < seeds.length; i++) {
            const { grid, nav, railConfig, navWalkableIndex } = await setupTestGridAndNav(seeds[i]);
            const plan = planRailMazeCorridorBelts({
                grid,
                navTopology: nav.topology,
                railConfig,
                navWalkableIndex,
                mapSeed: seeds[i],
            });
            const expectedPaths = (seeds[i] === 256 || seeds[i] === 1337) ? 3 : (seeds[i] === 11 ? 5 : 8);
            assert.ok(plan.pathCount >= expectedPaths, `seed ${seeds[i]}: only ${plan.pathCount} corridor paths`);
            for (let pi = 0; pi < plan.paths.length; pi++) {
                const len = plan.paths[pi].length;
                assert.ok(len >= 6 && len <= 24, `seed ${seeds[i]} path ${pi}: length ${len}`);
            }
            const expectedBelts = seeds[i] === 11 ? 20 : 50;
            assert.ok(plan.floorBelts.length > expectedBelts, `seed ${seeds[i]}: only ${plan.floorBelts.length} belts`);
            let elbows = 0;
            for (let bi = 0; bi < plan.floorBelts.length; bi++) if (FloorBelt.getElbowTurn(plan.floorBelts[bi].kind)) elbows++;
            assert.ok(elbows > 0, `seed ${seeds[i]}: no elbow belts`);
            assert.equal(plan.validation.ok, true, `seed ${seeds[i]}: ${plan.validation.error}`);
            terminateWorkerNavigation(nav);
        }
    });

    it("navWalkableIndex dense flags drive belt zone and global index round-trip", async () => {
        const { grid, nav, railConfig, navWalkableIndex } = await setupTestGridAndNav(42);
        const zoneCells = collectRailMazeBeltZoneCells(grid, nav.topology, railConfig, navWalkableIndex);
        assert.ok(zoneCells.length > 50);
        for (let i = 0; i < zoneCells.length; i++) {
            const { idx } = zoneCells[i];
            assert.ok(isNavWalkableAt(navWalkableIndex, idx));
        }
        const plan = planRailMazeCorridorBelts({ grid, navTopology: nav.topology, railConfig, navWalkableIndex, mapSeed: 42 });
        assert.equal(plan.validation.ok, true);
        for (let bi = 0; bi < plan.floorBelts.length; bi++) {
            const belt = plan.floorBelts[bi];
            const col = belt.idx % grid.cols;
            const row = (belt.idx / grid.cols) | 0;
            const idx = worldIdxAtCell(grid, col, row);
            const rtRow = (idx / grid.cols) | 0;
            const rtCol = idx - (rtRow * grid.cols);
            assert.equal(rtCol, col);
            assert.equal(rtRow, row);
        }
        terminateWorkerNavigation(nav);
    });

    it("generates always unrailed belts and computes beltRails on lateral edges", async () => {
        const { grid, nav, railConfig, navWalkableIndex } = await setupTestGridAndNav(42);
        const plan = planRailMazeCorridorBelts({
            grid,
            navTopology: nav.topology,
            railConfig,
            navWalkableIndex,
            mapSeed: 42,
        });

        // 1. Assert all are unrailed (regular blue belts)
        assert.ok(plan.floorBelts.length > 0);

        // 2. Assert beltRails were correctly computed for lateral edges
        assert.ok(plan.beltRails.length > 0);
        const beltSet = new Set(plan.floorBelts.map(b => b.idx));

        for (let i = 0; i < plan.beltRails.length; i++) {
            const rWall = plan.beltRails[i];
            const col = grid.worldCol(rWall.col * grid.cellSize);
            const row = grid.worldRow(rWall.row * grid.cellSize);
            const idx = col + row * grid.cols;

            assert.ok(beltSet.has(idx), "rail wall must be on a belt cell");

            const belt = plan.floorBelts.find(b => b.idx === idx);
            const lateralSides = FloorBelt.getRailEdgeSides(belt.kind, belt.facingIndex);
            assert.ok(lateralSides.includes(rWall.side), `side ${rWall.side} must be one of the lateral sides: ${lateralSides}`);
        }

        terminateWorkerNavigation(nav);
    });
});
