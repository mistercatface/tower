import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { createNavRuntime } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { generateRailMazeAction, spawnBoidTriangleAction, focusBoidTriangleAction, setShadowsFullAction } from "../Libraries/Game/gameLaunchActions.js";
import { isSandboxCameraTarget } from "../Libraries/Sandbox/sandboxCameraTarget.js";

function createEditorTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        sandbox: new SandboxWorldState(),
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
        },
        nav: createNavRuntime(grid),
        mapSeed: 42,
    };
}

describe("snake game launch actions", () => {
    it("generates a rail maze, spawns/focuses a boid, and sets shadows to 100%", async () => {
        const state = createEditorTestState();
        const ctx = {};

        // 1. Verify generateRailMazeAction
        await generateRailMazeAction(state);
        assert.equal(state.editor.railMazeConfig.edgeThickness, 4);
        assert.equal(state.editor.railMazeConfig.wallHeightLevel, 1);
        assert.equal(state.editor.railMazeConfig.surfaceProfileId, "poolTableFelt");
        
        // 2. Verify spawnBoidTriangleAction
        spawnBoidTriangleAction(state, ctx);
        assert.ok(ctx.boid);
        assert.equal(ctx.boid.type, "boid_triangle");
        assert.equal(ctx.boid.x, state.viewport.x);
        assert.equal(ctx.boid.y, state.viewport.y);
        
        // 3. Verify focusBoidTriangleAction
        focusBoidTriangleAction(state, ctx);
        assert.ok(isSandboxCameraTarget(state, ctx.boid));
        assert.equal(state.viewport.zoom, 2.0);
        assert.equal(state.viewport.x, ctx.boid.x);
        assert.equal(state.viewport.y, ctx.boid.y);

        // 4. Verify setShadowsFullAction
        setShadowsFullAction(state);
        assert.equal(state.losShadowStrength, 1.0);
    });
});
