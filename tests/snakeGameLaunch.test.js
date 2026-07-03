import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { createNavRuntime } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { runGameLaunch, GAME_LAUNCHERS } from "../Libraries/Game/gameLaunch.js";
import { isSandboxCameraTarget } from "../Libraries/Sandbox/sandboxCameraTarget.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";

function createEditorTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    
    const selectedIds = [];
    const session = {
        select({ kind, ids }) {
            selectedIds.push(...ids);
        },
        sync() {}
    };
    
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        selectedIds,
        sandbox: {
            ...new SandboxWorldState(),
            controller: { session }
        },
        viewport: { 
            x: 128, 
            y: 128, 
            snapTo(x, y) {
                this.x = x;
                this.y = y;
            },
            circleInBounds() { return true; } 
        },
        worldSurfaces: { 
            settings: { maxWallHeightLevel: 8 },
            clearBakeCache() {},
            invalidateGridBounds() {}
        },
        editor: { 
            cavernConfig: createDefaultMapGenBoundsConfig(),
            railConfig: createDefaultMapGenBoundsConfig(),
            railMazeConfig: {
                ...createDefaultMapGenBoundsConfig(),
                wallHeightLevel: 1,
                edgeThickness: 1,
                corridorWidthMin: 1,
                corridorWidthMax: 2,
                extraLinkRatio: 0.25,
                surfaceProfileId: "cyberGrid",
            },
            eraseConfig: createDefaultMapGenBoundsConfig(),
            lockSelection: false,
        },
        nav: createNavRuntime(grid),
        mapSeed: 42,
    };
}

describe("snake game launch actions", () => {
    it("generates a rail maze, spawns/focuses a boid, and sets shadows to 100%", async () => {
        const state = createEditorTestState();
        state.appLaunch = { id: "snake", launcher: GAME_LAUNCHERS.snake };

        const ctx = await runGameLaunch(state, GAME_LAUNCHERS.snake);

        // Verify Maze Config
        assert.equal(state.editor.railMazeConfig.edgeThickness, 4);
        assert.equal(state.editor.railMazeConfig.wallHeightLevel, 1);
        assert.equal(state.editor.railMazeConfig.surfaceProfileId, "poolTableFelt");
        
        // Verify Boid
        assert.ok(ctx.boid);
        assert.equal(ctx.boid.type, "boid_triangle");
        assert.equal(ctx.boid.x, state.viewport.x);
        assert.equal(ctx.boid.y, state.viewport.y);
        assert.deepEqual(state.selectedIds, [ctx.boid.id]);
        
        // Verify Focus
        assert.ok(isSandboxCameraTarget(state, ctx.boid));
        assert.equal(state.viewport.zoom, 2.0);
        assert.equal(state.viewport.x, ctx.boid.x);
        assert.equal(state.viewport.y, ctx.boid.y);

        // Verify Shadows
        assert.equal(state.losShadowStrength, 1.0);

        // Verify Selection Lock
        assert.equal(state.editor.lockSelection, true);

        // Verify Red Explore Boids
        const redBoids = state.worldProps.filter(p => p.type === "boid_triangle" && p.alwaysExplore);
        assert.equal(redBoids.length, 2);
        for (const rb of redBoids) {
            assert.equal(rb.visualOverride?.tint, "#ff3366");
            const behaviorId = getSandboxEntityMeta(state).getActiveBehaviorId(rb.id);
            assert.equal(behaviorId, "explore");
        }
    });
});
