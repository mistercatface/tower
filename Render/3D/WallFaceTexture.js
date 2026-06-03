import { floorTileSettings, gridSettings } from "../../Config/Config.js";
import { drawImageQuad } from "./draw/AffineTexture.js";
import { CAMERA_HEIGHT } from "./math/CombatProjection.js";
import { getFloorTextureProfileId, isFloorTileAnimationEnabled } from "../Floor/floorTextureProfile.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { getPixelsPerWorldUnit, shouldSmoothTextureDownsample } from "../Floor/floorTextureResolution.js";
import { animationFrameIndex } from "../Floor/ProfileBakeResolver.js";
import { getWallCacheInfo } from "../Floor/FloorTileSystem.js";

const WALL_ANGLE_SPREAD = 0.002;

const sCorner0 = { x: 0, y: 0 };
const sCorner1 = { x: 0, y: 0 };
const sCorner2 = { x: 0, y: 0 };
const sCorner3 = { x: 0, y: 0 };

export function getWallVisualHeight() {
    const configured = floorTileSettings.wallVisualHeight;
    if (configured != null) return configured;
    return CAMERA_HEIGHT - 10;
}

export const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };

export function computeProjectedFace(p1, p2, px, py, wallHeight = getWallVisualHeight(), out = sharedScratchFace) {
    let angle1 = Math.atan2(p1.y - py, p1.x - px);
    let angle2 = Math.atan2(p2.y - py, p2.x - px);
    const cross = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
    if (cross > 0) {
        angle1 -= WALL_ANGLE_SPREAD;
        angle2 += WALL_ANGLE_SPREAD;
    } else {
        angle1 += WALL_ANGLE_SPREAD;
        angle2 -= WALL_ANGLE_SPREAD;
    }

    const dist1 = Math.hypot(p1.x - px, p1.y - py);
    const dist2 = Math.hypot(p2.x - px, p2.y - py);
    const clampedHeight = Math.min(wallHeight, CAMERA_HEIGHT - 1);
    const alpha = clampedHeight / (CAMERA_HEIGHT - clampedHeight);

    out.proj1X = p1.x + Math.cos(angle1) * dist1 * alpha;
    out.proj1Y = p1.y + Math.sin(angle1) * dist1 * alpha;
    out.proj2X = p2.x + Math.cos(angle2) * dist2 * alpha;
    out.proj2Y = p2.y + Math.sin(angle2) * dist2 * alpha;

    return out;
}

export function traceProjectedFace(ctx, p1, p2, face) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(face.proj1X, face.proj1Y);
    ctx.lineTo(face.proj2X, face.proj2Y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
}

function getViewportWorldBounds(viewport, padding = floorTileSettings.viewPaddingPx ?? 128) {
    if (!viewport) return null;
    return viewport.getWorldBounds(viewport.cx * 2, viewport.cy * 2, padding);
}

function rowBoundsIntersects(bl, br, tl, tr, bounds) {
    if (!bounds) return true;
    const minX = Math.min(bl.x, br.x, tl.x, tr.x);
    const maxX = Math.max(bl.x, br.x, tl.x, tr.x);
    const minY = Math.min(bl.y, br.y, tl.y, tr.y);
    const maxY = Math.max(bl.y, br.y, tl.y, tr.y);
    return !(maxX < bounds.minX || minX > bounds.maxX || maxY < bounds.minY || minY > bounds.maxY);
}

function getWallTextureStoryCount() {
    return floorTileSettings.wallTextureStories ?? 16;
}

/** World-aligned slices along the wall base edge (stable when the camera moves). */
export function wallFaceColumns(p1, p2, tileWorldSize) {
    const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (edgeLen < 0.001) return [];

    const edgeDirX = (p2.x - p1.x) / edgeLen;
    const edgeDirY = (p2.y - p1.y) / edgeLen;
    const uStart = p1.x * edgeDirX + p1.y * edgeDirY;
    const uEnd = uStart + edgeLen;
    const firstTile = Math.floor(uStart / tileWorldSize);
    const lastTile = Math.ceil(uEnd / tileWorldSize);
    const columns = [];

    for (let tile = firstTile; tile < lastTile; tile++) {
        const u0World = tile * tileWorldSize;
        const u1World = (tile + 1) * tileWorldSize;
        let u0 = (u0World - uStart) / edgeLen;
        let u1 = (u1World - uStart) / edgeLen;
        u0 = Math.max(0, Math.min(1, u0));
        u1 = Math.max(0, Math.min(1, u1));
        if (u1 - u0 < 1e-6) continue;

        const midU = (u0 + u1) * 0.5;
        columns.push({ u0, u1, worldX: p1.x + (p2.x - p1.x) * midU, worldY: p1.y + (p2.y - p1.y) * midU });
    }

    return columns;
}

function computeFaceCorner(out, p1, p2, proj1X, proj1Y, proj2X, proj2Y, u, v) {
    const bx = p1.x + (p2.x - p1.x) * u;
    const by = p1.y + (p2.y - p1.y) * u;
    const tx = proj1X + (proj2X - proj1X) * u;
    const ty = proj1Y + (proj2Y - proj1Y) * u;
    out.x = bx + (tx - bx) * v;
    out.y = by + (ty - by) * v;
}

function drawFaceTexture(ctx, p1, p2, face, floorTiles, state, viewport, wallHeight, fillStyle, cacheObj = null) {
    const tileWorldSize = floorTileSettings.tileWorldSize ?? gridSettings.cellSize;
    if (!floorTiles || !state) return;

    const profileId = getFloorTextureProfileId(state);
    const ppwu = getPixelsPerWorldUnit();
    const storyCount = getWallTextureStoryCount();

    const wallCx = cacheObj && cacheObj.cx !== undefined ? cacheObj.cx : (p1.x + p2.x) * 0.5;
    const wallCy = cacheObj && cacheObj.cy !== undefined ? cacheObj.cy : (p1.y + p2.y) * 0.5;

    const { key: wallCacheKey, wrappedP1, wrappedP2 } = getWallCacheInfo(p1, p2, state, profileId, ppwu, cacheObj);

    // The cache always holds the latest (possibly merged) frame array for this
    // key, so a single lookup per frame keeps us current without local memos.
    let flatCanvases = floorTiles.surfaceCache.get(wallCacheKey);
    if (!flatCanvases) {
        const columns = wallFaceColumns(wrappedP1, wrappedP2, tileWorldSize);
        if (columns.length === 0) return;
        flatCanvases = floorTiles.ensureWallFace(wallCacheKey, wrappedP1, wrappedP2, columns, storyCount, state, tileWorldSize);
        if (!flatCanvases || flatCanvases.length === 0) return;
    }

    const profile = getFloorProceduralProfile(profileId);
    let flatCanvas = flatCanvases[0];
    if (!flatCanvas || flatCanvas.isPlaceholder) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }

    // Use the nearest already-baked frame; the loop sharpens as frames stream in.
    if (isFloorTileAnimationEnabled(profile) && flatCanvases.length > 1) {
        const currentFrame = animationFrameIndex(profile.animation, { gameTime: state.gameTime ?? 0 });
        flatCanvas = flatCanvases[Math.min(flatCanvases.length - 1, Math.max(0, currentFrame))];
    }

    const worldBounds = getViewportWorldBounds(viewport);
    const bleedPx = floorTileSettings.wallTextureBleedPx ?? 1;

    const clampedHeight = Math.min(wallHeight, CAMERA_HEIGHT - 1);
    const alphaMax = clampedHeight / (CAMERA_HEIGHT - clampedHeight);
    if (alphaMax <= 0) return;

    ctx.save();
    ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample();

    const edgeLen = cacheObj && cacheObj.edgeLen !== undefined ? cacheObj.edgeLen : Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const px = state.player.x;
    const py = state.player.y;
    const dist = Math.hypot(wallCx - px, wallCy - py);

    const subdivScale = Math.max(0.05, Math.min(1.0, 1.0 - (dist - 80) / 320));
    const SUBDIV_X = Math.max(1, Math.min(2, Math.ceil((edgeLen / tileWorldSize) * subdivScale)));
    const SUBDIV_Y = Math.max(1, Math.min(2, Math.ceil((storyCount / 2) * subdivScale)));

    for (let row = 0; row < SUBDIV_Y; row++) {
        const bottomZ = row * (wallHeight / SUBDIV_Y);
        let topZ = (row + 1) * (wallHeight / SUBDIV_Y);

        if (bottomZ >= CAMERA_HEIGHT) break;
        if (topZ >= CAMERA_HEIGHT) topZ = CAMERA_HEIGHT - 1;

        const alphaBottom = bottomZ / (CAMERA_HEIGHT - bottomZ);
        const alphaTop = topZ / (CAMERA_HEIGHT - topZ);

        const v0 = alphaBottom / alphaMax;
        const v1 = alphaTop / alphaMax;

        const sy0 = (row / SUBDIV_Y) * flatCanvas.height;
        const sy1 = ((row + 1) / SUBDIV_Y) * flatCanvas.height;

        for (let col = 0; col < SUBDIV_X; col++) {
            const u0 = col / SUBDIV_X;
            const u1 = (col + 1) / SUBDIV_X;

            computeFaceCorner(sCorner0, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u0, v0);
            computeFaceCorner(sCorner1, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u1, v0);
            computeFaceCorner(sCorner2, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u1, v1);
            computeFaceCorner(sCorner3, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u0, v1);

            if (!rowBoundsIntersects(sCorner0, sCorner1, sCorner2, sCorner3, worldBounds)) continue;

            const sx0 = u0 * flatCanvas.width;
            const sx1 = u1 * flatCanvas.width;

            drawImageQuad(ctx, flatCanvas, sx0, sy0, sx1, sy1, sCorner0, sCorner1, sCorner2, sCorner3, { bleedPx });
        }
    }

    ctx.restore();
}

export function drawProjectedWallFace(ctx, p1, p2, px, py, fillStyle, floorTiles, state, { viewport = null, damageAlpha = 0, textureEnabled = true, cacheObj = null } = {}) {
    const wallHeight = getWallVisualHeight();
    const face = computeProjectedFace(p1, p2, px, py, wallHeight);
    traceProjectedFace(ctx, p1, p2, face);
    if (floorTiles && textureEnabled) {
        drawFaceTexture(ctx, p1, p2, face, floorTiles, state, viewport, wallHeight, fillStyle, cacheObj);
    } else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (damageAlpha > 0) {
        ctx.save();
        traceProjectedFace(ctx, p1, p2, face);
        ctx.clip();
        ctx.fillStyle = `rgba(244, 67, 54, ${damageAlpha})`;
        ctx.fill();
        ctx.restore();
    }
}

export function preloadProjectedWallFace(p1, p2, floorTiles, state, cacheObj = null) {
    const tileWorldSize = floorTileSettings.tileWorldSize ?? gridSettings.cellSize;
    if (!floorTiles || !state) return;

    const profileId = getFloorTextureProfileId(state);
    const ppwu = getPixelsPerWorldUnit();
    const storyCount = getWallTextureStoryCount();

    const { key: wallCacheKey, wrappedP1, wrappedP2 } = getWallCacheInfo(p1, p2, state, profileId, ppwu, cacheObj);

    let flatCanvases = floorTiles.surfaceCache.get(wallCacheKey);
    if (!flatCanvases) {
        const columns = wallFaceColumns(wrappedP1, wrappedP2, tileWorldSize);
        if (columns.length === 0) return;
        floorTiles.ensureWallFace(wallCacheKey, wrappedP1, wrappedP2, columns, storyCount, state, tileWorldSize);
    }
}

