import { playBoundsFromObstacleGrid } from "../../Libraries/Spatial/playBounds.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { buildGroundChunkBakePayload, resolveSurfaceProfileAtCoords } from "./surfaceProfileResolver.js";
import { collectStaticFillRoofHeightsFromGrid } from "../../Libraries/Spatial/grid/gridCellTopology.js";
export class WorldSurfaceSystem extends WorldSurfaceEngine {
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
        const roofZ = state.obstacleGrid.collectStaticStructureZLevels();
        super.invalidateGridBounds(bounds, state.obstacleGrid, (x, y) => resolveSurfaceProfileAtCoords(state, x, y), cellsPerChunk, roofZ);
    }
    drawGround(ctx, state, viewport) {
        this.drawGroundChunks(ctx, { obstacleGrid: state.obstacleGrid, viewport, state, zLevel: 0, playBounds: playBoundsFromObstacleGrid(state.obstacleGrid) });
    }
    drawRoofs(ctx, state, viewport) {
        const staticHeights = collectStaticFillRoofHeightsFromGrid(state.obstacleGrid);
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
    drawFlatWallRails(ctx, state, viewport) {
        const zLevels = state.obstacleGrid.collectStaticStructureZLevels();
        const fallbackZ = this.settings.wallHeight;
        const levels = zLevels.length ? zLevels : [fallbackZ];
        const playBounds = playBoundsFromObstacleGrid(state.obstacleGrid);
        for (let i = 0; i < levels.length; i++)
            this.drawGroundChunks(ctx, {
                obstacleGrid: state.obstacleGrid,
                wallSpatialIndex: state.wallSpatialIndex,
                viewport,
                state,
                zLevel: levels[i],
                playBounds,
                requireWallSegments: false,
                flatWallRails: true,
            });
    }
}
