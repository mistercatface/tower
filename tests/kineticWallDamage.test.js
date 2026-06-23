import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNAKE_KINETIC_MIN_STRIKE_SPEED } from "../Config/games/snake.js";
import {
    applyPendingWallDamage,
    computeWallImpactDamage,
    createGridWallDamage,
    flushPendingWallDamage,
    queueWallHits,
    resolveKineticWallDamage,
    resolveWallDamageTarget,
    wallDamageKey,
} from "../Libraries/Sandbox/gridWallDamage.js";
import { stampRailWallsQuiet } from "../Libraries/Sandbox/gridWallEdit.js";
import { isRailWallEdge } from "../Libraries/Spatial/grid/CellEdge.js";
import { cellIsStaticWall } from "../Libraries/Spatial/grid/gridCellTopology.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { patchNavWalkableCellIndex } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { resolveSnakeWallDamageConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
const WALL_DAMAGE = resolveSnakeWallDamageConfig();
async function createWallDamageTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 128, 128);
    const navigation = await createWorkerNavigation(grid);
    const state = { obstacleGrid: grid, sandbox: {}, worldSurfaces: { settings: getGameWorldSurfaceSettings(), invalidateGridBounds: () => {} }, navigation };
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    return state;
}
function stampVoxel(grid, col, row, level = 1) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = level;
}
describe("kinetic wall damage", () => {
    it("resolveSnakeWallDamageConfig shares kinetic floor and reference speed ceiling", () => {
        assert.equal(WALL_DAMAGE.minStrikeSpeed, SNAKE_KINETIC_MIN_STRIKE_SPEED);
        assert.equal(WALL_DAMAGE.referenceMaxSpeed, 560);
    });
    it("computeWallImpactDamage scales with speed and approach angle", () => {
        assert.equal(computeWallImpactDamage(20, -20, WALL_DAMAGE), 0);
        assert.equal(computeWallImpactDamage(560, 10, WALL_DAMAGE), 0);
        const maxHit = computeWallImpactDamage(560, -560, WALL_DAMAGE);
        assert.ok(Math.abs(maxHit - 45) < 0.001);
        const graze = computeWallImpactDamage(560, -112, WALL_DAMAGE);
        assert.ok(Math.abs(graze - 9) < 0.001);
    });
    it("resolveKineticWallDamage queues hits for any kinetic body", async () => {
        const state = await createWallDamageTestState();
        state.sandbox.gridWallDamage = createGridWallDamage(state, WALL_DAMAGE);
        stampVoxel(state.obstacleGrid, 6, 6);
        const segment = { gridCol: 6, gridRow: 6, isStaticGridProxy: true, isEdgeRail: false };
        const entity = { id: 42, vx: 560, vy: 0 };
        const wallResolver = {
            resolve(body) {
                body._wallResolveHits = [{ approachDot: -560, normalX: 1, normalY: 0, segment }];
                return true;
            },
        };
        resolveKineticWallDamage(state, entity, {}, wallResolver);
        assert.equal(state.sandbox.gridWallDamage.session.pendingDamage.get("v:6,6"), 45);
        flushPendingWallDamage(state);
        assert.ok(state.sandbox.gridWallDamage.session.entries.get("v:6,6").hp < 100);
        terminateWorkerNavigation(state.nav);
    });
    it("resolveWallDamageTarget distinguishes voxel and rail segments", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 2, 2);
        stampRailWallsQuiet(state, [{ col: 4, row: 4, side: 1, heightLevel: 1, thicknessLevel: 1 }]);
        const voxelSeg = { gridCol: 2, gridRow: 2, isStaticGridProxy: true, isEdgeRail: false };
        const railSeg = { gridCol: 4, gridRow: 4, gridSide: 1, isStaticGridProxy: false, isEdgeRail: true };
        assert.equal(resolveWallDamageTarget(grid, voxelSeg)?.kind, "voxel");
        assert.equal(resolveWallDamageTarget(grid, railSeg)?.kind, "rail");
        terminateWorkerNavigation(state.nav);
    });
    it("three max-power head-on hits destroy a voxel wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampVoxel(grid, 3, 3);
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        const segment = { gridCol: 3, gridRow: 3, isStaticGridProxy: true, isEdgeRail: false };
        const hit = { approachDot: -560, normalX: 1, normalY: 0, segment };
        for (let i = 0; i < 3; i++) {
            queueWallHits(wallDamage.session, grid, [hit], 560, WALL_DAMAGE);
            await applyPendingWallDamage(state, wallDamage.session, wallDamage.commit, WALL_DAMAGE);
        }
        assert.ok(!cellIsStaticWall(grid, 3, 3));
        assert.equal(wallDamage.session.entries.size, 0);
        terminateWorkerNavigation(state.nav);
    });
    it("three max-power head-on hits destroy a rail wall", async () => {
        const state = await createWallDamageTestState();
        const grid = state.obstacleGrid;
        stampRailWallsQuiet(state, [{ col: 5, row: 5, side: 0, heightLevel: 1, thicknessLevel: 1 }]);
        const wallDamage = createGridWallDamage(state, WALL_DAMAGE);
        const segment = { gridCol: 5, gridRow: 5, gridSide: 0, isStaticGridProxy: false, isEdgeRail: true };
        const hit = { approachDot: -560, normalX: 0, normalY: 1, segment };
        for (let i = 0; i < 3; i++) {
            queueWallHits(wallDamage.session, grid, [hit], 560, WALL_DAMAGE);
            await applyPendingWallDamage(state, wallDamage.session, wallDamage.commit, WALL_DAMAGE);
        }
        assert.ok(!isRailWallEdge(grid.edgeStore.get(5, 5, 0, grid.cols)));
        terminateWorkerNavigation(state.nav);
    });
    it("wallDamageKey round-trips voxel and rail targets", () => {
        assert.equal(wallDamageKey({ kind: "voxel", col: 1, row: 2 }), "v:1,2");
        assert.equal(wallDamageKey({ kind: "rail", col: 3, row: 4, side: 1 }), "r:3,4:1");
    });
});
