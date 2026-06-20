import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNAKE_GAME_DEFAULTS } from "../Config/games/snake.js";
import { createDeferredGridWallCommit } from "../Libraries/Sandbox/deferredGridWallCommit.js";
import {
    applyPendingStrikerWallDamage,
    computeStrikerWallDamage,
    createGridWallDamageSession,
    queueStrikerWallHits,
    resolveWallDamageTarget,
    wallDamageKey,
} from "../Libraries/Sandbox/gridWallDamage.js";
import { stampRailWallsQuiet } from "../Libraries/Sandbox/gridWallEdit.js";
import { isRailWallEdge } from "../Libraries/Spatial/grid/CellEdge.js";
import { cellIsStaticWall } from "../Libraries/Spatial/grid/gridCellTopology.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createTestNavigation } from "../Libraries/Navigation/GridNavContext.js";
import { patchNavWalkableCellIndex } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";

const WALL_DAMAGE = SNAKE_GAME_DEFAULTS.wallDamage;

function createStrikerWallDamageTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 128, 128);
    const navigation = createTestNavigation(grid);
    const state = {
        obstacleGrid: grid,
        sandbox: {},
        worldSurfaces: { settings: getGameWorldSurfaceSettings(), invalidateGridBounds: () => {} },
        navigation,
    };
    state.navigation.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    return state;
}

function stampVoxel(grid, col, row, level = 1) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = level;
}

describe("striker wall damage (4b)", () => {
    it("computeStrikerWallDamage scales with speed and approach angle", () => {
        assert.equal(computeStrikerWallDamage(20, -20, WALL_DAMAGE), 0);
        assert.equal(computeStrikerWallDamage(560, 10, WALL_DAMAGE), 0);
        const maxHit = computeStrikerWallDamage(560, -560, WALL_DAMAGE);
        assert.ok(Math.abs(maxHit - 45) < 0.001);
        const graze = computeStrikerWallDamage(560, -112, WALL_DAMAGE);
        assert.ok(Math.abs(graze - 9) < 0.001);
    });

    it("resolveWallDamageTarget distinguishes voxel and rail segments", () => {
        const state = createStrikerWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 2, 2);
        stampRailWallsQuiet(state, [{ col: 4, row: 4, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const voxelSeg = { gridCol: 2, gridRow: 2, isStaticGridProxy: true, isEdgeRail: false };
        const railSeg = { gridCol: 4, gridRow: 4, gridSide: 1, isStaticGridProxy: false, isEdgeRail: true };
        assert.equal(resolveWallDamageTarget(grid, voxelSeg)?.kind, "voxel");
        assert.equal(resolveWallDamageTarget(grid, railSeg)?.kind, "rail");
    });

    it("three max-power head-on hits destroy a voxel wall", async () => {
        const state = createStrikerWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 3, 3);
        const session = createGridWallDamageSession();
        const commit = createDeferredGridWallCommit(state);
        const segment = { gridCol: 3, gridRow: 3, isStaticGridProxy: true, isEdgeRail: false };
        const hit = { approachDot: -560, normalX: 1, normalY: 0, segment };
        for (let i = 0; i < 3; i++) {
            queueStrikerWallHits(session, grid, [hit], 560, WALL_DAMAGE);
            await applyPendingStrikerWallDamage(state, session, commit, WALL_DAMAGE);
        }
        assert.ok(!cellIsStaticWall(grid, 3, 3));
        assert.equal(session.entries.size, 0);
    });

    it("three max-power head-on hits destroy a rail wall", async () => {
        const state = createStrikerWallDamageTestState();
        const grid = state.obstacleGrid;
        stampRailWallsQuiet(state, [{ col: 5, row: 5, side: 0, heightLevel: 1, thicknessLevel: 1 }]);
        const session = createGridWallDamageSession();
        const commit = createDeferredGridWallCommit(state);
        const segment = { gridCol: 5, gridRow: 5, gridSide: 0, isStaticGridProxy: false, isEdgeRail: true };
        const hit = { approachDot: -560, normalX: 0, normalY: 1, segment };
        for (let i = 0; i < 3; i++) {
            queueStrikerWallHits(session, grid, [hit], 560, WALL_DAMAGE);
            await applyPendingStrikerWallDamage(state, session, commit, WALL_DAMAGE);
        }
        assert.ok(!isRailWallEdge(grid.edgeStore.get(5, 5, 0, grid.cols)));
    });

    it("wallDamageKey round-trips voxel and rail targets", () => {
        assert.equal(wallDamageKey({ kind: "voxel", col: 1, row: 2 }), "v:1,2");
        assert.equal(wallDamageKey({ kind: "rail", col: 3, row: 4, side: 1 }), "r:3,4:1");
    });
});
