/**
 * Game-facing world-surface system: wraps WorldSurfaceEngine with simulation
 * shadow underpaint and GameState profile / invalidation hooks.
 */
import { getWorldPlayBounds } from "../../Core/GamePorts.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { WallSpatialIndex } from "../../Libraries/Spatial/indexes/WallSpatialIndex.js";
import { getChunkSizePx } from "../../Libraries/Spatial/grid/ChunkGrid.js";
import { buildGroundChunkBakePayload, resolveSurfaceProfileAtCoords } from "./surfaceProfileResolver.js";
import { RenderScene } from "../../Libraries/Render/Scene/RenderScene.js";
import { SceneCompiler } from "../../Libraries/Render/Scene/SceneCompiler.js";
export class WorldSurfaceSystem extends WorldSurfaceEngine {
    /** @param {import("../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} [settings] */
    constructor(settings = getGameWorldSurfaceSettings()) {
        super(settings, { buildChunkPayload: (state, chunkCol, chunkRow, zLevel) => buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel) });
        this.roofZLevels = null;
        this.roofSpatialIndices = null;
        this.worldSurfaceSeed = 0;
        this.surfaceProfileOverride = null;
        this.renderScene = new RenderScene(getChunkSizePx(settings.cellSize, settings.cellsPerChunk));
    }
    /** Invalidate baked ground/wall textures only — keeps compiled static geometry. */
    clearBakeCache() {
        super.clear();
        this.invalidateRoofs();
    }
    clear() {
        this.clearBakeCache();
        this.surfaceProfileOverride = null;
        this.renderScene.clear();
    }
    invalidateRoofs() {
        this.roofZLevels = null;
        this.roofSpatialIndices = null;
    }
    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        super.invalidateGridBounds(bounds, state.obstacleGrid, (x, y) => resolveSurfaceProfileAtCoords(state, x, y), cellsPerChunk, this.roofZLevels);
    }
    /** Draw procedural ground: shadow underpaint + baked chunk textures (simulation/inspector scenes only). */
    drawGround(ctx, state, viewport) {
        this.drawGroundChunks(ctx, {
            obstacleGrid: state.obstacleGrid,
            viewport,
            canvasWidth: state.canvasBounds.width,
            canvasHeight: state.canvasBounds.height,
            state,
            gameTime: state.gameTime,
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
        if (!this.roofZLevels) {
            const zSet = new Set();
            this.roofSpatialIndices = new Map();
            for (const w of state.walls)
                if (!w.isDead && w.wallHeight != null) {
                    zSet.add(w.wallHeight);
                    let index = this.roofSpatialIndices.get(w.wallHeight);
                    if (!index) {
                        index = new WallSpatialIndex(100);
                        this.roofSpatialIndices.set(w.wallHeight, index);
                    }
                    index.insert(w);
                }
            this.roofZLevels = Array.from(zSet).sort((a, b) => a - b);
        }
        this.drawRoofLayers(ctx, {
            obstacleGrid: state.obstacleGrid,
            wallSpatialIndex: state.wallSpatialIndex,
            viewport,
            canvasWidth: state.canvasBounds.width,
            canvasHeight: state.canvasBounds.height,
            state,
            gameTime: state.gameTime,
            playBounds: getWorldPlayBounds(state),
            roofZLevels: this.roofZLevels,
            roofSpatialIndices: this.roofSpatialIndices,
            renderScene: this.renderScene,
        });
    }
}
