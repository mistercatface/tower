import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../../Spatial/Grid/ChunkGrid.js";
import { snapWorldToCellOrigin } from "../../Spatial/Geometry/GridCoords.js";
import { FloorChunkCache } from "./FloorChunkCache.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { floorCellCacheKey, floorChunkCacheKey, getFloorTextureProfileId } from "./floorTextureProfile.js";
import { drawBakedTexture, getPixelsPerWorldUnit } from "./floorTextureResolution.js";

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
        const ppwu = getPixelsPerWorldUnit();
        if (this._tileTexture && this._tileTextureSeed === seed && this._tileTextureProfileId === profileId && this._tileTexturePpwu === ppwu) {
            return this._tileTexture;
        }
        this._tileTextureSeed = seed;
        this._tileTextureProfileId = profileId;
        this._tileTexturePpwu = ppwu;

        const placeholder = [{ isPlaceholder: true }];
        this._tileTexture = placeholder;

        TileWorkerCoordinator.requestTileTextureBake({ seed, profileId }).then((canvases) => {
            if (this._tileTextureSeed === seed && this._tileTextureProfileId === profileId) {
                this._tileTexture = canvases;
            } else {
                canvases.forEach((c) => c.close());
            }
        });

        return placeholder;
    }

    getCellCanvas(worldX, worldY, state) {
        const profileId = getFloorTextureProfileId(state);
        const obstacleGrid = state.obstacleGrid;
        const { col, row, x, y } = snapWorldToCellOrigin(worldX, worldY, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cellSize);
        const key = floorCellCacheKey(col, row, profileId);
        let canvases = this.cellCache.get(key);
        if (canvases) return canvases;

        const placeholder = [{ isPlaceholder: true }];
        this.cellCache.set(key, placeholder);

        TileWorkerCoordinator.requestFloorCellBake({ worldX: x, worldY: y, seed: state.floorTileSeed ?? 0, profileId }).then((bitmaps) => {
            const existing = this.cellCache.get(key);
            if (existing === placeholder) {
                this.cellCache.set(key, bitmaps);
            } else {
                bitmaps.forEach((b) => b.close());
            }
        });

        return placeholder;
    }

    drawWallCell(ctx, worldX, worldY, storyRow, state) {
        const profileId = getFloorTextureProfileId(state);
        const obstacleGrid = state.obstacleGrid;
        const { col, row, x, y } = snapWorldToCellOrigin(worldX, worldY, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cellSize);

        // Wall cells can reuse the cell cache but need a unique key incorporating storyRow
        const key = `wall_${floorCellCacheKey(col, row, profileId)}_${storyRow}`;
        let canvases = this.cellCache.get(key);

        if (!canvases) {
            const placeholder = [{ isPlaceholder: true }];
            this.cellCache.set(key, placeholder);

            TileWorkerCoordinator.requestLabWallCellBake({
                worldX: x,
                worldY: y,
                seed: state.floorTileSeed ?? 0,
                profileId,
                storyRow,
                frameIndex: 0, // Assumes no animation for immediate wall cell draw in game right now, or needs GameTime
            }).then((bitmaps) => {
                const existing = this.cellCache.get(key);
                if (existing === placeholder) {
                    this.cellCache.set(key, bitmaps);
                } else {
                    bitmaps.forEach((b) => b.close());
                }
            });
            return;
        }

        if (canvases[0]?.isPlaceholder) return;

        // Assume non-animated or first frame for now if drawn immediately
        drawBakedTexture(ctx, canvases[0], x, y, obstacleGrid.cellSize, obstacleGrid.cellSize);
    }

    bakeWallFace(width, height, p1, p2, pixelsPerUnit, state) {
        const profileId = getFloorTextureProfileId(state);
        return TileWorkerCoordinator.requestWallFaceBake({ width, height, p1, p2, pixelsPerUnit, seed: state.floorTileSeed ?? 0, profileId });
    }

    getChunkCanvas(chunkCol, chunkRow, state, priority = Infinity) {
        const profileId = getFloorTextureProfileId(state);
        const key = floorChunkCacheKey(chunkCol, chunkRow, profileId);
        let canvases = this.cache.get(key);
        if (canvases) return canvases;

        const placeholder = [{ isPlaceholder: true }];
        this.cache.set(key, placeholder);

        TileWorkerCoordinator.requestFloorChunkBake(
            { chunkCol, chunkRow, minX: state.obstacleGrid.minX, minY: state.obstacleGrid.minY, seed: state.floorTileSeed ?? 0, profileId },
            priority,
        ).then((bitmaps) => {
            const existing = this.cache.get(key);
            if (existing === placeholder) {
                this.cache.set(key, bitmaps);
            } else {
                bitmaps.forEach((b) => b.close());
            }
        });

        return placeholder;
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

        const chunksToDraw = [];
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const origin = chunkToWorldOrigin(chunkCol, chunkRow, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
                const centerX = origin.x + chunkSizePx / 2;
                const centerY = origin.y + chunkSizePx / 2;
                const distSq = (centerX - viewport.x) ** 2 + (centerY - viewport.y) ** 2;
                chunksToDraw.push({ chunkCol, chunkRow, origin, distSq });
            }
        }

        chunksToDraw.sort((a, b) => a.distSq - b.distSq);

        for (const chunk of chunksToDraw) {
            const canvases = this.getChunkCanvas(chunk.chunkCol, chunk.chunkRow, state, chunk.distSq);
            let canvas = canvases[0];
            if (canvas.isPlaceholder) continue;

            if (profile.animation && canvases.length > 1) {
                const frames = canvases.length;
                const duration = profile.animation.durationMs ?? 1000;
                const clock = state.gameTime ?? 0;
                const currentFrame = Math.floor(((clock % duration) / duration) * frames);
                canvas = canvases[Math.min(frames - 1, Math.max(0, currentFrame))];
            }
            drawBakedTexture(ctx, canvas, chunk.origin.x, chunk.origin.y, chunkSizePx, chunkSizePx);
        }
    }
}
