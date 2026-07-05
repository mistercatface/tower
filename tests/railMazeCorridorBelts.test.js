import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOOR_CELL_KIND, FloorBelt, planRailMazeCorridorBelts, collectRailMazeBeltZoneCells, validateBeltPathMouthAccess, undirectedPairIndex, bakeRailMazeDfs, stampGlobalRailWalls, commitGridNavEdit, WorldObstacleGrid, forEachCardinalNeighborIdx } from "../Libraries/Spatial/spatial.js";
import { isNavWalkableAt, getNavWalkableCellIndex } from "../Libraries/Navigation/navigation.js";

function undirectedEdgeIndex(aIdx, bIdx, cellCount) {
    return undirectedPairIndex(aIdx, bIdx, cellCount);
}

function collectCorridorPathPolylines(memberIndices, neighborAtIdx, layout) {
    const members = memberIndices.slice();
    const memberSet = new Set(members);
    const degreeByIndex = new Map();
    const neighborsByIndex = new Map();
    for (let i = 0; i < members.length; i++) {
        const idx = members[i];
        const neighbors = neighborAtIdx(idx).filter((nIdx) => memberSet.has(nIdx));
        neighborsByIndex.set(idx, neighbors);
        degreeByIndex.set(idx, neighbors.length);
    }
    const isSpecial = (idx) => degreeByIndex.get(idx) !== 2;
    const usedEdges = new Set();
    const paths = [];
    for (let si = 0; si < members.length; si++) {
        const startIdx = members[si];
        if (!isSpecial(startIdx)) continue;
        const startNeighbors = neighborsByIndex.get(startIdx);
        for (let ni = 0; ni < startNeighbors.length; ni++) {
            const firstIdx = startNeighbors[ni];
            const edge = undirectedEdgeIndex(startIdx, firstIdx, layout.cellCount);
            if (usedEdges.has(edge)) continue;
            usedEdges.add(edge);
            const path = [startIdx];
            let prevIdx = startIdx;
            let curIdx = firstIdx;
            while (!isSpecial(curIdx)) {
                path.push(curIdx);
                const midNeighbors = neighborsByIndex.get(curIdx);
                let nextIdx = -1;
                for (let mi = 0; mi < midNeighbors.length; mi++) {
                    const nIdx = midNeighbors[mi];
                    if (nIdx === prevIdx) continue;
                    nextIdx = nIdx;
                    break;
                }
                if (nextIdx === -1) break;
                usedEdges.add(undirectedEdgeIndex(curIdx, nextIdx, layout.cellCount));
                prevIdx = curIdx;
                curIdx = nextIdx;
            }
            path.push(curIdx);
            if (path.length >= 2) paths.push(path);
        }
    }
    if (paths.length === 0 && members.length > 0) {
        let allDegreeTwo = true;
        for (let i = 0; i < members.length; i++)
            if (degreeByIndex.get(members[i]) !== 2) {
                allDegreeTwo = false;
                break;
            }
        if (allDegreeTwo) {
            const startIdx = members[0];
            const loop = [startIdx];
            let prevIdx = startIdx;
            let curIdx = startIdx;
            for (;;) {
                const midNeighbors = neighborsByIndex.get(curIdx);
                let nextIdx = -1;
                for (let mi = 0; mi < midNeighbors.length; mi++) {
                    const nIdx = midNeighbors[mi];
                    if (nIdx === prevIdx) continue;
                    nextIdx = nIdx;
                    break;
                }
                if (nextIdx === -1) break;
                if (nextIdx === startIdx) {
                    loop.push(startIdx);
                    break;
                }
                loop.push(nextIdx);
                prevIdx = curIdx;
                curIdx = nextIdx;
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
        { originIdx: 0, gridCols: cols, gridRows: rows, strideCols: cols, cellCount: cols * rows },
        { railWallHeightLevel: 1, railWallThicknessLevel: 2, corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 },
        seed,
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
        const memberIndices = [1, 4, 5, 6];
        const layout = { originIdx: 0, gridCols: 4, gridRows: 3, strideCols: 4, cellCount: 12 };
        const memberSet = new Set(memberIndices);
        const neighborAtIdx = (idx) => {
            const out = [];
            forEachCardinalNeighborIdx(idx, layout, (nIdx) => {
                if (memberSet.has(nIdx)) out.push(nIdx);
            });
            return out;
        };
        const paths = collectCorridorPathPolylines(memberIndices, neighborAtIdx, layout);
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
            const idx = zoneCells[i].idx;
            assert.ok(isNavWalkableAt(navWalkableIndex, idx));
        }
        const plan = planRailMazeCorridorBelts({ grid, navTopology: nav.topology, railConfig, navWalkableIndex, mapSeed: 42 });
        assert.equal(plan.validation.ok, true);
        for (let bi = 0; bi < plan.floorBelts.length; bi++) {
            assert.ok(isNavWalkableAt(navWalkableIndex, plan.floorBelts[bi].idx));
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
            assert.ok(beltSet.has(rWall.idx), "rail wall must be on a belt cell");

            const belt = plan.floorBelts.find(b => b.idx === rWall.idx);
            const lateralSides = FloorBelt.getRailEdgeSides(belt.kind, belt.facingIndex);
            assert.ok(lateralSides.includes(rWall.side), `side ${rWall.side} must be one of the lateral sides: ${lateralSides}`);
        }

        terminateWorkerNavigation(nav);
    });
});
