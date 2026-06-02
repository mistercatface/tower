import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../../Spatial/Grid/ChunkGrid.js";
import { snapWorldToCellOrigin } from "../../Spatial/Geometry/GridCoords.js";
import { FloorChunkCache } from "./FloorChunkCache.js";
import {
    bakeFloorCellCanvas,
    bakeFloorChunkCanvas,
    drawWallCell,
    bakeWallFaceCanvases,
    bakeFloorTileTextureCanvas,
} from "./FloorTilePainter.js";
import {
    floorCellCacheKey,
    floorChunkCacheKey,
    getFloorTextureProfileId,
} from "./floorTextureProfile.js";
import { drawBakedTexture, getTexturePixelsPerWorldUnit } from "./floorTextureResolution.js";

export class FloorTileSystem {
    constructor() {
        this.cache = new FloorChunkCache();
        this.cellCache = new FloorChunkCache(floorTileSettings.maxCachedWallCells);
        this._tileTexture = null;
        this._tileTextureSeed = null;
        this._tileTextureProfileId = null;
        this._tileTexturePpwu = null;
        this.proceduralProfileId = null;
    }

    clear() {
        this.cache.clear();
        this.cellCache.clear();
        this._tileTexture = null;
        this._tileTextureSeed = null;
        this._tileTextureProfileId = null;
        this._tileTexturePpwu = null;
    }

    invalidateGridBounds(bounds, state, cellsPerChunk = floorTileSettings.cellsPerChunk) {
        if (!bounds) return;
        const profileId = getFloorTextureProfileId(state);
        const range = gridBoundsToChunkRange(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cellsPerChunk);
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                this.cache.delete(floorChunkCacheKey(chunkCol, chunkRow, profileId));
            }
        }
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
            for (let col = bounds.startCol; col <= bounds.endCol; col++) {
                this.cellCache.delete(floorCellCacheKey(col, row, profileId));
            }
        }
    }

    getTileTextureCanvas(state) {
        const seed = state.floorTileSeed ?? 0;
        const profileId = getFloorTextureProfileId(state);
        const ppwu = getTexturePixelsPerWorldUnit();
        if (
            this._tileTexture &&
            this._tileTextureSeed === seed &&
            this._tileTextureProfileId === profileId &&
            this._tileTexturePpwu === ppwu
        ) {
            return this._tileTexture;
        }
        this._tileTextureSeed = seed;
        this._tileTextureProfileId = profileId;
        this._tileTexturePpwu = ppwu;
        this._tileTexture = bakeFloorTileTextureCanvas(seed, state.obstacleGrid?.cellSize, profileId);
        return this._tileTexture;
    }

    getCellCanvas(worldX, worldY, state) {
        const profileId = getFloorTextureProfileId(state);
        const obstacleGrid = state.obstacleGrid;
        const { col, row, x, y } = snapWorldToCellOrigin(worldX, worldY, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cellSize);
        const key = floorCellCacheKey(col, row, profileId);
        let canvas = this.cellCache.get(key);
        if (canvas) return canvas;

        canvas = bakeFloorCellCanvas(x, y, obstacleGrid, state.floorTileSeed ?? 0, profileId);
        this.cellCache.set(key, canvas);
        return canvas;
    }

    drawWallCell(ctx, worldX, worldY, storyRow, state) {
        const profileId = getFloorTextureProfileId(state);
        const obstacleGrid = state.obstacleGrid;
        const { x, y } = snapWorldToCellOrigin(worldX, worldY, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cellSize);
        drawWallCell(ctx, x, y, storyRow, obstacleGrid, state.floorTileSeed ?? 0, profileId);
    }

    bakeWallFace(width, height, p1, p2, pixelsPerUnit, state) {
        const profileId = getFloorTextureProfileId(state);
        return bakeWallFaceCanvases(
            width,
            height,
            p1,
            p2,
            pixelsPerUnit,
            state.obstacleGrid,
            state.floorTileSeed ?? 0,
            profileId
        );
    }

    getChunkCanvas(chunkCol, chunkRow, state) {
        const profileId = getFloorTextureProfileId(state);
        const key = floorChunkCacheKey(chunkCol, chunkRow, profileId);
        let canvas = this.cache.get(key);
        if (canvas) return canvas;

        canvas = bakeFloorChunkCanvas({
            chunkCol,
            chunkRow,
            obstacleGrid: state.obstacleGrid,
            seed: state.floorTileSeed ?? 0,
            profileId,
        });
        this.cache.set(key, canvas);
        return canvas;
    }

    draw(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) {
            return;
        }

        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = floorTileSettings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const bounds = viewport.getWorldBounds(ctx.canvas?.width ?? viewport.cx * 2, ctx.canvas?.height ?? viewport.cy * 2, floorTileSettings.viewPaddingPx);

        ctx.fillStyle = combatVisualSettings.floorShadow;
        ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

        const range = worldBoundsToChunkRange(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);

        const profileId = getFloorTextureProfileId(state);
        const profile = getFloorProceduralProfile(profileId);

        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const canvases = this.getChunkCanvas(chunkCol, chunkRow, state);
                let canvas = canvases[0];
                if (profile.animation && canvases.length > 1) {
                    const frames = canvases.length;
                    const duration = profile.animation.durationMs ?? 1000;
                    const clock = state.gameClock ?? 0;
                    const currentFrame = Math.floor((clock % duration) / duration * frames);
                    canvas = canvases[Math.min(frames - 1, Math.max(0, currentFrame))];
                }
                const origin = chunkToWorldOrigin(chunkCol, chunkRow, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
                drawBakedTexture(ctx, canvas, origin.x, origin.y, chunkSizePx, chunkSizePx);
            }
        }
    }
}
