import { defaultWallCapPx } from "../../Libraries/World/wallGridBake.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { gameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
export class WorldSurfaceSystem extends WorldSurfaceEngine {
    _bindSceneDraw(ctx, state, viewport) {
        this.bindGroundChunkDraw(ctx, state.obstacleGrid, viewport, state, state.obstacleGrid);
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
