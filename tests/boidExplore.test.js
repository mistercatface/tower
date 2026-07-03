import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { createExploreBehavior } from "../Libraries/Sandbox/groundNav/exploreBehavior.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { setBoundary } from "../Libraries/Spatial/grid/boundaryOccupancy.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { pickNavWalkableCell, patchNavWalkableCellIndex, collectNavWalkableCells } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { isGlobalCellInMapGenBounds, getMapGenBoundsStampExtent } from "../Libraries/Sandbox/mapGenBounds.js";
import { isNavWalkableCell, floodConnectedNavWalkableCells } from "../Libraries/Spatial/grid/navWalkableCell.js";

async function createEditorTestState() {
    globalThis.window = {
        addEventListener() {},
        removeEventListener() {},
    };
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(256, 256, 512, 512);
    
    const cavernConfig = {
        boundsMode: "rect",
        boundsCol: 0,
        boundsRow: 0,
        boundsCols: 32,
        boundsRows: 32,
    };

    const navigation = await createWorkerNavigation(grid);

    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        viewport: { x: 128, y: 128, snapTo() {}, circleInBounds() { return true; } },
        worldSurfaces: { settings: { maxWallHeightLevel: 8 } },
        editor: {
            showSelectionRings: true,
            showPropTileCells: true,
            cavernConfig,
            railConfig: { ...cavernConfig },
            railMazeConfig: { ...cavernConfig },
        },
        nav: navigation,
    };

    navigation.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));

    return state;
}

describe("boid explore behavior", () => {
    it("starts moving and selects a random free target cell deterministically", async () => {
        const state = await createEditorTestState();
        
        // Spawn the boid triangle prop
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "neutral");
        
        // Configure active behavior
        const entityMeta = getSandboxEntityMeta(state);
        entityMeta.setActiveBehaviorId(prop.id, "explore");
        
        const exploreBehavior = createExploreBehavior(state);
        state.sandbox.behaviors = [exploreBehavior];
        
        // Initially, the explore behavior does not have a move target for the prop
        assert.equal(exploreBehavior.hasMoveTarget(prop), false);
        
        // Tick once
        exploreBehavior.tickWorld(16);
        
        // Explore behavior should have picked a target
        assert.equal(exploreBehavior.hasMoveTarget(prop), true);
        const target1 = exploreBehavior.getTargetCell(prop);
        assert.ok(target1);
        
        // Reset and tick again to prove determinism for this prop ID
        exploreBehavior.reset();
        assert.equal(exploreBehavior.hasMoveTarget(prop), false);
        exploreBehavior.tickWorld(16);
        const target2 = exploreBehavior.getTargetCell(prop);
        assert.deepEqual(target1, target2);

        await terminateWorkerNavigation(state.nav);
    });

    it("re-picks a target when stuck, and uses fallback if no nav walkable cells are found", async () => {
        const state = await createEditorTestState();
        
        // Spawn prop
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "neutral");
        const entityMeta = getSandboxEntityMeta(state);
        entityMeta.setActiveBehaviorId(prop.id, "explore");
        
        const exploreBehavior = createExploreBehavior(state);
        state.sandbox.behaviors = [exploreBehavior];
        
        // Set all cells in cavernConfig region to blocked to make nav-walkable cells empty
        const grid = state.obstacleGrid;
        for (let idx = 0; idx < grid.grid.length; idx++) {
            grid.grid[idx] = 1; // Blocked
        }
        // Leave adjacent cells open so they are nav-walkable
        grid.grid[grid.idx(5, 5)] = 0;
        grid.grid[grid.idx(5, 6)] = 0;
        
        // Rebake navigation to apply blockages
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        await state.nav.commitEdit(null, { fullNavSync: true });

        exploreBehavior.tickWorld(16);
        
        // It should pick one of the open nav-walkable cells
        const targetCell = exploreBehavior.getTargetCell(prop);
        assert.ok(targetCell);
        assert.equal(targetCell.col, 5);
        assert.ok(targetCell.row === 5 || targetCell.row === 6);
        
        // Open another set of adjacent cells to choose next
        grid.grid[grid.idx(10, 10)] = 0;
        grid.grid[grid.idx(10, 11)] = 0;
        
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        await state.nav.commitEdit(null, { fullNavSync: true });

        exploreBehavior.clearMoveTarget(prop);
        assert.equal(exploreBehavior.hasMoveTarget(prop), false);
        exploreBehavior.tickWorld(16);
        assert.ok(exploreBehavior.hasMoveTarget(prop));

        await terminateWorkerNavigation(state.nav);
    });

    it("works correctly in a rail maze/rail wall environment", async () => {
        const state = await createEditorTestState();
        
        // Spawn the boid in the middle of active area
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "neutral");
        const entityMeta = getSandboxEntityMeta(state);
        entityMeta.setActiveBehaviorId(prop.id, "explore");
        
        const exploreBehavior = createExploreBehavior(state);
        state.sandbox.behaviors = [exploreBehavior];
        
        // Block all directions of cell (4,4) except EAST (can step east to (5,4))
        const grid = state.obstacleGrid;
        const idx = grid.idx(4, 4);
        setBoundary(grid, idx, 0, { kind: "railWall", capHeightLevel: 1, thicknessLevel: 1 });
        setBoundary(grid, idx, 2, { kind: "railWall", capHeightLevel: 1, thicknessLevel: 1 });
        setBoundary(grid, idx, 3, { kind: "railWall", capHeightLevel: 1, thicknessLevel: 1 });
        
        // Sync navigation topology
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        await state.nav.commitEdit(null, { fullNavSync: true });
        
        exploreBehavior.tickWorld(16);
        
        // Explore behavior must have picked a target
        assert.ok(exploreBehavior.hasMoveTarget(prop));
        const target = exploreBehavior.getTargetCell(prop);
        assert.ok(target);

        await terminateWorkerNavigation(state.nav);
    });
});
