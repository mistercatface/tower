/**
 * Game-facing world-surface system: wraps WorldSurfaceEngine with phase checks,
 * simulation shadow underpaint, and GameState profile / invalidation hooks.
 */
import { getWorldPlayBounds } from "../../Core/GamePorts.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { isWorldScene } from "../../Core/GamePorts.js";
import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { WallSpatialIndex } from "../../Libraries/Spatial/indexes/WallSpatialIndex.js";
import { buildGroundChunkBakePayload, resolveSurfaceProfileAtCoords } from "./surfaceProfileResolver.js";
export class WorldSurfaceSystem extends WorldSurfaceEngine {
    /** @param {import("../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} [settings] */
    constructor(settings = getGameWorldSurfaceSettings()) {
        super(settings, { buildChunkPayload: (state, chunkCol, chunkRow, zLevel) => buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel) });
    }
    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        super.invalidateGridBounds(bounds, state.obstacleGrid, (x, y) => resolveSurfaceProfileAtCoords(state, x, y), cellsPerChunk, state.roofZLevels);
    }
    /** Draw procedural ground: shadow underpaint + baked chunk textures (simulation/inspector scenes only). */
    drawGround(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) return;
        this.drawGroundChunks(ctx, {
            obstacleGrid: state.obstacleGrid,
            viewport,
            canvasWidth: ctx.canvas?.width ?? viewport.cx * 2,
            canvasHeight: ctx.canvas?.height ?? viewport.cy * 2,
            state,
            gameTime: state.gameTime ?? 0,
            zLevel: 0,
            playBounds: getWorldPlayBounds(state),
            beforeDraw: (drawCtx, bounds) => {
                drawCtx.fillStyle = this.settings.floorShadow;
                drawCtx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            },
        });
    }
    /** Chunk-cached roof layers at wall height (after walls). */
    drawRoofs(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) return;
        if (!state.roofZLevels) {
            const zSet = new Set();
            state.roofSpatialIndices = new Map();
            for (const w of state.walls)
                if (!w.isDead && w.wallHeight != null) {
                    zSet.add(w.wallHeight);
                    let index = state.roofSpatialIndices.get(w.wallHeight);
                    if (!index) {
                        index = new WallSpatialIndex(100);
                        state.roofSpatialIndices.set(w.wallHeight, index);
                    }
                    index.insert(w);
                }
            state.roofZLevels = Array.from(zSet).sort((a, b) => a - b);
        }
        this.drawRoofLayers(ctx, {
            obstacleGrid: state.obstacleGrid,
            wallSpatialIndex: state.wallSpatialIndex,
            viewport,
            canvasWidth: ctx.canvas?.width ?? viewport.cx * 2,
            canvasHeight: ctx.canvas?.height ?? viewport.cy * 2,
            state,
            gameTime: state.gameTime ?? 0,
            playBounds: getWorldPlayBounds(state),
            roofZLevels: state.roofZLevels,
        });
    }
}
