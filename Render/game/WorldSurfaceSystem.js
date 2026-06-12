/**
 * Game-facing world-surface system: wraps WorldSurfaceEngine with simulation
 * shadow underpaint and GameState profile / invalidation hooks.
 */
import { playBoundsFromObstacleGrid } from "../../Libraries/Spatial/playBounds.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { buildGroundChunkBakePayload, resolveSurfaceProfileAtCoords } from "./surfaceProfileResolver.js";
import { collectStaticRoofHeightsFromGrid } from "../../Libraries/World/wallGridCells.js";
export class WorldSurfaceSystem extends WorldSurfaceEngine {
    /** @param {import("../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} [settings] */
    constructor(settings = getGameWorldSurfaceSettings()) {
        super(settings, { buildChunkPayload: (state, chunkCol, chunkRow, zLevel) => buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel) });
        this.worldSurfaceSeed = 0;
        this.surfaceProfileOverride = null;
    }
    clearBakeCache() {
        super.clear();
    }
    clear() {
        this.clearBakeCache();
        this.surfaceProfileOverride = null;
    }
    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        const roofZ = collectStaticRoofHeightsFromGrid(state.obstacleGrid);
        super.invalidateGridBounds(bounds, state.obstacleGrid, (x, y) => resolveSurfaceProfileAtCoords(state, x, y), cellsPerChunk, roofZ);
    }
    /** Draw procedural ground: shadow underpaint + baked chunk textures (simulation/inspector scenes only). */
    drawGround(ctx, state, viewport) {
        this.drawGroundChunks(ctx, {
            obstacleGrid: state.obstacleGrid,
            viewport,
            state,
            zLevel: 0,
            playBounds: playBoundsFromObstacleGrid(state.obstacleGrid),
            beforeDraw: (drawCtx, bounds) => {
                drawCtx.fillStyle = this.settings.floorShadow;
                drawCtx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            },
        });
    }
    /** Chunk-cached roof layers for stamped static walls. */
    drawRoofs(ctx, state, viewport) {
        const staticHeights = collectStaticRoofHeightsFromGrid(state.obstacleGrid);
        for (let i = 0; i < staticHeights.length; i++) {
            const zLevel = staticHeights[i];
            this.drawGroundChunks(ctx, {
                obstacleGrid: state.obstacleGrid,
                wallSpatialIndex: state.wallSpatialIndex,
                viewport,
                state,
                zLevel,
                playBounds: playBoundsFromObstacleGrid(state.obstacleGrid),
                requireWallSegments: false,
                staticRoofDraw: true,
            });
        }
    }
    /** Flat world-aligned wall rails — same chunk bake path as floor, clipped to segment footprints. */
    drawFlatWallRails(ctx, state, viewport) {
        const wallHeight = this.settings.wallHeight;
        this.drawGroundChunks(ctx, {
            obstacleGrid: state.obstacleGrid,
            wallSpatialIndex: state.wallSpatialIndex,
            viewport,
            state,
            zLevel: wallHeight,
            playBounds: playBoundsFromObstacleGrid(state.obstacleGrid),
            flatWallRails: true,
        });
    }
}
