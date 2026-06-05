/**
 * Procedural world-surface bake cache: ground chunks + wall atlases (shared by projected wall/roof draw).
 * Does not project geometry — see ProjectedWallDraw.js for that.
 */
import { getWorldSurfaceSettings, resolveWallVisualHeight } from "../../Libraries/WorldSurface/WorldSurfaceSettings.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../../Spatial/Grid/ChunkGrid.js";
import { ProgressiveFrameCache } from "./ProgressiveFrameCache.js";
import {
    groundChunkCachePrefix,
    getGroundChunkAnimationInfo,
    getWallAtlasAnimationInfo,
} from "../../Libraries/WorldSurface/bake/SurfaceBakeHelpers.js";
import { buildGroundChunkBakePayload, resolveSurfaceProfileAtCoords } from "../game/surfaceProfileResolver.js";
import { TileWorkerCoordinator, getProfileRevision } from "./TileWorkerCoordinator.js";
import { drawBakedTexture, getPixelsPerWorldUnit } from "./WorldSurfaceResolution.js";
import { animationFrameIndex } from "./ProfileBakeResolver.js";
import { bakeFrameRange } from "./AnimationFrameBake.js";

export class WorldSurfaceSystem {
    /** @param {import("../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} [settings] */
    constructor(settings = getWorldSurfaceSettings()) {
        this.settings = settings;
        this.surfaceCache = new ProgressiveFrameCache(settings.maxCachedSurfaces);
        this.proceduralProfileId = null;
        this._globalGeneration = 0;
    }

    clear() {
        this.surfaceCache.clear();
    }

    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        if (!bounds) return;
        const obstacleGrid = state.obstacleGrid;
        const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
        const range = gridBoundsToChunkRange(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cellsPerChunk);
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
                const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
                const profileId = resolveSurfaceProfileAtCoords(state, chunkCenterX, chunkCenterY);
                this.surfaceCache.deleteByPrefix(
                    "chunk:" + groundChunkCachePrefix(
                        chunkCol,
                        chunkRow,
                        profileId,
                        getProfileRevision(profileId),
                        getPixelsPerWorldUnit(this.settings),
                    ).substring(6),
                );
            }
        }
    }

    requestWallAtlasBake(width, height, p1, p2, pixelsPerUnit, surfaceBake, frameRange, profileId, wallHeight = null, wallWidth = null) {
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        return TileWorkerCoordinator.requestWallAtlasBake({
            width,
            height,
            p1,
            p2,
            pixelsPerUnit,
            seed: surfaceBake.surfaceSeed,
            profileId,
            ...frameRange,
            centerX,
            centerY,
            wallHeight,
            wallWidth,
        });
    }

    _buildChunkPayload(state, chunkCol, chunkRow) {
        const payload = buildGroundChunkBakePayload(state, chunkCol, chunkRow);
        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = this.settings.cellsPerChunk;
        if (obstacleGrid) {
            const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
            payload.centerX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
            payload.centerY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
        }
        return payload;
    }

    updateFills() {
        this.surfaceCache.updateFills();
    }

    hasPendingSurfaceBakes() {
        return this.surfaceCache.hasPlaceholders();
    }

    _scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn) {
        const placeholder = this.surfaceCache.getOrStart(key, meta);
        const generation = this.surfaceCache.getCurrentGeneration(key);
        const isAnimated = meta.totalFrames > 1;

        if (isAnimated) {
            this.surfaceCache.requestFill(key, bakeBatchFn, meta.totalFrames);
        }

        bakeFirstFn().then((firstFrameBitmaps) => {
            this.surfaceCache.commitFirstFrame(key, generation, firstFrameBitmaps);
        });

        return placeholder;
    }

    getGroundChunkCanvas(chunkCol, chunkRow, state, payload = null) {
        if (!payload) payload = this._buildChunkPayload(state, chunkCol, chunkRow);

        const key = groundChunkCachePrefix(
            chunkCol,
            chunkRow,
            payload.profileId,
            getProfileRevision(payload.profileId),
            getPixelsPerWorldUnit(this.settings),
        );
        let canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;

        const profile = getSurfaceProfileProvider().getProfile(payload.profileId);
        const { enabled: isAnimated, totalFrames } = getGroundChunkAnimationInfo(profile);

        const meta = { kind: "chunk", payload, totalFrames };

        const bakeFirstFn = () => {
            const framePayload = { ...payload, ...bakeFrameRange.first() };
            return TileWorkerCoordinator.requestGroundChunkBake(framePayload);
        };

        const bakeBatchFn = isAnimated ? (batch) => {
            return TileWorkerCoordinator.requestGroundChunkBake({ ...payload, ...batch });
        } : null;

        return this._scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn);
    }

    /** Ensure a baked wall atlas exists in the cache (faces + roof strip). */
    ensureWallAtlas(key, p1, p2, columns, storyCount, surfaceBake, tileWorldSize, wallHeight = null) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;

        const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (edgeLen < 0.001 || columns.length === 0) return null;

        const cellSize = surfaceBake.obstacleCellSize ?? 32;
        const ppwu = getPixelsPerWorldUnit(this.settings);
        const pixelsPerUnit = (cellSize / tileWorldSize) * ppwu;

        const canvasWidth = Math.max(1, Math.ceil(edgeLen * pixelsPerUnit));
        const hVal = wallHeight ?? resolveWallVisualHeight(this.settings.cameraHeight, this.settings);
        const unrolledHeight = 2 * hVal + cellSize;
        const canvasHeight = Math.max(1, Math.ceil(unrolledHeight * pixelsPerUnit));

        const wallCenterX = (p1.x + p2.x) / 2;
        const wallCenterY = (p1.y + p2.y) / 2;
        const profileId = surfaceBake.resolveProfileAt(wallCenterX, wallCenterY);
        const profile = getSurfaceProfileProvider().getProfile(profileId);
        const { enabled: isAnimated, totalFrames } = getWallAtlasAnimationInfo(profile);

        const meta = { kind: "wall", width: canvasWidth, height: canvasHeight, p1, p2, pixelsPerUnit, totalFrames };

        const bakeFirstFn = () => {
            const frameRange = bakeFrameRange.first();
            return this.requestWallAtlasBake(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, surfaceBake, frameRange, profileId, hVal, cellSize);
        };

        const bakeBatchFn = isAnimated ? (batch) => {
            return this.requestWallAtlasBake(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, surfaceBake, batch, profileId, hVal, cellSize);
        } : null;

        return this._scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn);
    }

    /** Draw procedural ground chunks (shadow fill + baked textures). */
    drawGround(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) {
            return;
        }

        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = this.settings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const bounds = viewport.getWorldBounds(ctx.canvas?.width ?? viewport.cx * 2, ctx.canvas?.height ?? viewport.cy * 2, this.settings.viewPaddingPx);

        TileWorkerCoordinator.updateFocus(viewport.x, viewport.y);

        ctx.fillStyle = this.settings.floorShadow;
        ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

        const range = worldBoundsToChunkRange(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);

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
            const payload = this._buildChunkPayload(state, chunk.chunkCol, chunk.chunkRow);
            const canvases = this.getGroundChunkCanvas(chunk.chunkCol, chunk.chunkRow, state, payload);
            let canvas = canvases[0];
            if (canvas.isPlaceholder) continue;

            const profile = getSurfaceProfileProvider().getProfile(payload.profileId);
            const { enabled: chunkAnimationEnabled } = getGroundChunkAnimationInfo(profile);

            if (chunkAnimationEnabled && canvases.length > 1) {
                const currentFrame = animationFrameIndex(profile.animation, { gameTime: state.gameTime ?? 0 });
                canvas = canvases[Math.min(canvases.length - 1, Math.max(0, currentFrame))];
            }

            drawBakedTexture(ctx, canvas, chunk.origin.x, chunk.origin.y, chunkSizePx, chunkSizePx);
        }
    }
}
