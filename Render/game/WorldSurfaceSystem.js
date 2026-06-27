import { playBoundsFromObstacleGrid } from "../../Libraries/Spatial/playBounds.js";
import { defaultWallCapPx } from "../../Libraries/World/wallGridBake.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { gameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
export class WorldSurfaceSystem extends WorldSurfaceEngine {
    constructor(settings = gameWorldSurfaceSettings) {
        super(settings);
        this.worldSurfaceSeed = 0;
    }
    clearBakeCache() {
        super.clear();
    }
    clear() {
        this.clearBakeCache();
    }
    _bindSceneDraw(ctx, state, viewport) {
        this.bindGroundChunkDraw(ctx, state.obstacleGrid, viewport, state, playBoundsFromObstacleGrid(state.obstacleGrid));
    }
    drawGround(ctx, state, viewport) {
        this._bindSceneDraw(ctx, state, viewport);
        this.drawGroundPlaneChunks();
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
