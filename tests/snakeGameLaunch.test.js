import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { createKineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../Libraries/Sandbox/sandbox.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Spatial/spatial.js";
import { createNavRuntime } from "./WorkerNavigationFactory.js";
import { runGameLaunch, GAME_LAUNCHERS } from "../Libraries/Game/gameLaunch.js";
import { getMapGenBoundsCenterWorldF32, hasMapGenStamp, packChunkKey, cellToChunkCoord, isIdxInMapGenBounds } from "../Libraries/Spatial/spatial.js";
import { isNavWalkableCellAt } from "../Libraries/Navigation/navigation.js";
import { ENGINE_F32, M_VEC_A } from "../Core/engineMemory.js";

const CELLS_PER_CHUNK = 16;

function chunkProfileAtCell(grid, col, row) {
    const key = packChunkKey(cellToChunkCoord(col, CELLS_PER_CHUNK), cellToChunkCoord(row, CELLS_PER_CHUNK));
    return grid.surfaceMaterials.getChunkAtKey(key);
}

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
        kinetic: createKineticSession(),
        selectedIds,
        sandbox: {
            ...new SandboxWorldState(),
            controller: { session }
        },
        viewport: { 
            x: 128, 
            y: 128, 
            zoom: 1.0,
            snapTo(x, y) {
                this.x = x;
                this.y = y;
            },
            setZoom(z) {
                this.zoom = z;
            },
            circleInBounds() { return true; } 
        },
        worldSurfaces: { 
            settings: { maxWallHeightLevel: 8, cellsPerChunk: CELLS_PER_CHUNK },
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
        assert.equal(state.editor.railMazeConfig.boundsCols, 64);
        assert.equal(state.editor.railMazeConfig.boundsRows, 64);
        assert.ok(state.editor.railMazeConfig.boundsIdx >= 0);
        getMapGenBoundsCenterWorldF32(ENGINE_F32, M_VEC_A, state.obstacleGrid, state.editor.railMazeConfig);
        assert.ok(Math.abs(ENGINE_F32[M_VEC_A]) < state.obstacleGrid.cellHalfSize + 0.01);
        assert.ok(Math.abs(ENGINE_F32[M_VEC_A + 1]) < state.obstacleGrid.cellHalfSize + 0.01);
        assert.equal(state.editor.railMazeConfig.edgeThickness, 4);
        assert.equal(state.editor.railMazeConfig.wallHeightLevel, 1);
        assert.equal(state.editor.railMazeConfig.surfaceProfileId, "poolTableFelt");
        assert.ok(hasMapGenStamp(state.editor.railMazeConfig));
        assert.equal(hasMapGenStamp(state.editor.railConfig), false);
        const grid = state.obstacleGrid;
        const stampCol = state.editor.railMazeConfig.stampedBoundsIdx % grid.cols;
        const stampRow = (state.editor.railMazeConfig.stampedBoundsIdx / grid.cols) | 0;
        assert.equal(chunkProfileAtCell(grid, stampCol, stampRow), "poolTableFelt");
        const outsideCol = stampCol + state.editor.railMazeConfig.stampedBoundsCols + 8;
        const outsideRow = stampRow + state.editor.railMazeConfig.stampedBoundsRows + 8;
        if (outsideCol < grid.cols && outsideRow < grid.rows) {
            assert.equal(chunkProfileAtCell(grid, outsideCol, outsideRow), null);
        }
        
        // Verify Boid
        assert.ok(ctx.boid);
        assert.equal(ctx.boid.type, "boid_triangle");
        const playerIdx = grid.worldToIdx(ctx.boid.x, ctx.boid.y);
        assert.ok(isIdxInMapGenBounds(state.editor.railMazeConfig, grid, playerIdx));
        assert.ok(isNavWalkableCellAt(state, playerIdx, state.editor.railMazeConfig, { boundsMode: "rect", boundsIdx: state.editor.railMazeConfig.boundsIdx + ((state.editor.railMazeConfig.boundsRows / 2) | 0) * grid.cols + ((state.editor.railMazeConfig.boundsCols / 2) | 0), boundsCols: 1, boundsRows: 1 }));
        assert.ok(Math.hypot(ctx.boid.x - ENGINE_F32[M_VEC_A], ctx.boid.y - ENGINE_F32[M_VEC_A + 1]) < grid.cellSize * 4);
        assert.deepEqual(state.selectedIds, [ctx.boid.id]);
        
        // Verify Focus
        assert.ok(state.sandbox.entityMeta.isCameraTarget(ctx.boid.id));
        assert.equal(state.viewport.zoom, 2.0);
        assert.equal(state.viewport.x, ctx.boid.x);
        assert.equal(state.viewport.y, ctx.boid.y);

        // Verify Selection Lock
        assert.equal(state.editor.lockSelection, true);
        assert.ok(state.appLaunch.session);
    });

    it("toggles navMode between hpa and flow and switches active behavior", async () => {
        const state = createEditorTestState();
        state.flowFieldGrid = {
            cols: 32,
            rows: 32,
            invalidateNavTopology() {},
            ensureRollTargetWindow() {},
            getReadyFlowField() {
                return new Uint8Array(32 * 32).fill(5);
            },
            worldToIdx(x, y) {
                const col = Math.floor((x - (-256)) / 16);
                const row = Math.floor((y - (-256)) / 16);
                if (col < 0 || col >= 32 || row < 0 || row >= 32) return -1;
                return row * 32 + col;
            },
            gridCenterX(col) {
                return col * 16 + 8 - 256;
            },
            gridCenterY(row) {
                return row * 16 + 8 - 256;
            },
            frame: {
                cellSize: 16,
                cols: 32,
                rows: 32,
                offsetX: 256,
                offsetY: 256,
                centerX: 0,
                centerY: 0
            }
        };
        state.appLaunch = { id: "snake", launcher: GAME_LAUNCHERS.snake };
        const ctx = await runGameLaunch(state, GAME_LAUNCHERS.snake);
        assert.ok(state.appLaunch.session);
        const boid = ctx.boid;

        // Initialize sandbox controller and behaviors
        const { createSandboxController, createDefaultSandboxBehaviors } = await import("../Libraries/Sandbox/sandbox.js");
        state.sandbox.controller = createSandboxController(state, {
            getCanvas: () => null,
            clientToWorld: (x, y) => ({ x, y }),
            behaviors: createDefaultSandboxBehaviors(state)
        });

        // Set default navMode
        state.editor.navMode = "hpa";
        
        // Simulate setting active behavior on the boid
        state.sandbox.entityMeta.setActiveBehaviorId(boid.id, "rollToCursorHpa");

        // Set a target on the old behavior
        const hpaBehavior = state.sandbox.behaviorById.get("rollToCursorHpa");
        hpaBehavior.setMoveTarget(boid, { x: 100, y: 120 });
        
        // Verify current state
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(boid.id), "rollToCursorHpa");
        
        // Toggle mode to flow using setEditorNavMode
        const { setEditorNavMode } = await import("../Apps/Editor/ui/editorUi.js");
        setEditorNavMode(state, "flow");
        
        // Verify state is updated to rollToCursorFlow and target is preserved
        assert.equal(state.editor.navMode, "flow");
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(boid.id), "rollToCursorFlow");
        
        const flowBehavior = state.sandbox.behaviorById.get("rollToCursorFlow");
        const overlay = flowBehavior.getPathOverlay(boid);
        assert.ok(overlay);
        assert.equal(overlay.targetX, 104);
        assert.equal(overlay.targetY, 120);
        assert.ok(overlay.pathNodes);
        assert.ok(overlay.pathNodes.length >= 2);
    });
});
