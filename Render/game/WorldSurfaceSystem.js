/**
 * Game-facing world-surface system: wraps WorldSurfaceEngine with phase checks,
 * combat shadow underpaint, and GameState profile / invalidation hooks.
 */
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { buildGroundChunkBakePayload, resolveSurfaceProfileAtCoords } from "./surfaceProfileResolver.js";

export class WorldSurfaceSystem extends WorldSurfaceEngine {
    /** @param {import("../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} [settings] */
    constructor(settings = getGameWorldSurfaceSettings()) {
        super(settings, {
            buildChunkPayload: (state, chunkCol, chunkRow, zLevel) =>
                buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel),
        });
    }

    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        super.invalidateGridBounds(
            bounds,
            state.obstacleGrid,
            (x, y) => resolveSurfaceProfileAtCoords(state, x, y),
            cellsPerChunk,
        );
    }

    /** Draw procedural ground: shadow underpaint + baked chunk textures (combat/world scenes only). */
    drawGround(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) {
            return;
        }

        this.drawGroundChunks(ctx, {
            obstacleGrid: state.obstacleGrid,
            viewport,
            canvasWidth: ctx.canvas?.width ?? viewport.cx * 2,
            canvasHeight: ctx.canvas?.height ?? viewport.cy * 2,
            state,
            gameTime: state.gameTime ?? 0,
            zLevel: 0,
            beforeDraw: (drawCtx, bounds) => {
                drawCtx.fillStyle = this.settings.floorShadow;
                drawCtx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            },
        });
    }

    /** Chunk-cached roof layers at configured z-levels (after walls). */
    drawRoofs(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) return;
        if (!(this.settings.roofZLevels?.length > 0)) return;

        const definition = getActiveGameDefinition();
        const clipRegions = definition?.getHorizontalSurfaceClipRegions?.(state) ?? null;

        this.drawRoofLayers(ctx, {
            obstacleGrid: state.obstacleGrid,
            viewport,
            canvasWidth: ctx.canvas?.width ?? viewport.cx * 2,
            canvasHeight: ctx.canvas?.height ?? viewport.cy * 2,
            state,
            gameTime: state.gameTime ?? 0,
            clipRegions,
        });
    }
}
