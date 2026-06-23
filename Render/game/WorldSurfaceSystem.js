import { playBoundsFromObstacleGrid } from "../../Libraries/Spatial/playBounds.js";
import { defaultWallCapPx } from "../../Libraries/World/wallGridBake.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { buildGroundChunkBakePayload, resolveSurfaceProfileAtCoords } from "./surfaceProfileResolver.js";
import { drawRoomGraphFloorPatches } from "../../Libraries/RoomGraph/roomGraphFloorDraw.js";
export class WorldSurfaceSystem extends WorldSurfaceEngine {
    constructor(settings = getGameWorldSurfaceSettings()) {
        super(settings, { buildChunkPayload: (state, chunkCol, chunkRow, zLevel, profileId) => buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel, profileId) });
        this.worldSurfaceSeed = 0;
        this.surfaceProfileOverride = null;
        this._profileResolveState = null;
        this._boundResolveProfile = this._resolveProfileAt.bind(this);
    }
    clearBakeCache() {
        super.clear();
    }
    clear() {
        this.clearBakeCache();
        this.surfaceProfileOverride = null;
    }
    _resolveProfileAt(x, y) {
        return resolveSurfaceProfileAtCoords(this._profileResolveState, x, y);
    }
    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        this._profileResolveState = state;
        super.invalidateGridBounds(bounds, state.obstacleGrid, this._boundResolveProfile, cellsPerChunk, state.obstacleGrid.collectStaticStructureZLevels());
    }
    _bindSceneDraw(ctx, state, viewport) {
        this.bindGroundChunkDraw(ctx, state.obstacleGrid, viewport, state, playBoundsFromObstacleGrid(state.obstacleGrid));
    }
    drawGround(ctx, state, viewport) {
        this._bindSceneDraw(ctx, state, viewport);
        this.drawGroundPlaneChunks();
        drawRoomGraphFloorPatches(ctx, this, state, viewport);
    }
    drawRoofs(ctx, state, viewport) {
        this._bindSceneDraw(ctx, state, viewport);
        this.drawStaticRoofChunksForLevels(state.obstacleGrid.collectStaticFillZLevels());
    }
    drawFlatWallRails(ctx, state, viewport) {
        this._bindSceneDraw(ctx, state, viewport);
        const zLevels = state.obstacleGrid.collectStaticStructureZLevels();
        const levels = zLevels.length ? zLevels : [defaultWallCapPx(this.settings)];
        this.drawFlatRailFloorChunksForLevels(levels);
    }
}
