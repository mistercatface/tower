/**
 * Projects wall faces in isometric space and samples baked atlases from WorldSurfaceEngine.
 * Roof caps are chunk-cached horizontal surfaces (WorldSurfaceEngine.drawRoofLayers).
 */
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
import { drawImageQuad } from "../../Canvas/AffineTexture.js";
/** @typedef {import("../WorldSceneTypes.js").SurfaceBakeContext} SurfaceBakeContext */
import { getTexelResolution, shouldSmoothTextureDownsample } from "../../WorldSurface/WorldSurfaceResolution.js";
import { resolveElevationAlpha } from "../../Spatial/iso/IsometricProjection.js";
export { getWallHeight };
export { wallFaceColumns } from "../../WorldSurface/WallFaceColumns.js";
const WALL_ANGLE_SPREAD = 0.002;
const sCorner0 = { x: 0, y: 0 };
const sCorner1 = { x: 0, y: 0 };
const sCorner2 = { x: 0, y: 0 };
const sCorner3 = { x: 0, y: 0 };
export const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
export function computeProjectedFace(p1, p2, px, py, wallHeight, settings, out = sharedScratchFace) {
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
    const { cameraHeight } = settings;
    const clampedHeight = Math.min(wallHeight, cameraHeight - 1);
    const alpha = resolveElevationAlpha(clampedHeight, cameraHeight);
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
function getViewportWorldBounds(viewport, padding) {
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
function computeFaceCorner(out, p1, p2, proj1X, proj1Y, proj2X, proj2Y, u, v) {
    const bx = p1.x + (p2.x - p1.x) * u;
    const by = p1.y + (p2.y - p1.y) * u;
    const tx = proj1X + (proj2X - proj1X) * u;
    const ty = proj1Y + (proj2Y - proj1Y) * u;
    out.x = bx + (tx - bx) * v;
    out.y = by + (ty - by) * v;
}
function resolveWallProfileId(surfaceBake, wallCx, wallCy, cacheObj) {
    let profileId = cacheObj ? cacheObj._cachedProfileId : null;
    if (!profileId || surfaceBake.surfaceProfileOverride) {
        profileId = surfaceBake.resolveProfileAt(wallCx, wallCy);
        if (cacheObj && !surfaceBake.surfaceProfileOverride) cacheObj._cachedProfileId = profileId;
    }
    return profileId;
}
function drawFaceTexture(ctx, p1, p2, face, worldSurfaces, surfaceBake, viewer, viewport, wallHeight, fillStyle, cacheObj = null) {
    const settings = worldSurfaces.settings;
    if (!settings) return;
    const cellSize = settings.cellSize;
    if (!worldSurfaces || !surfaceBake) return;
    const wallCx = cacheObj && cacheObj.cx !== undefined ? cacheObj.cx : (p1.x + p2.x) * 0.5;
    const wallCy = cacheObj && cacheObj.cy !== undefined ? cacheObj.cy : (p1.y + p2.y) * 0.5;
    const profileId = resolveWallProfileId(surfaceBake, wallCx, wallCy, cacheObj);
    const ppwu = getTexelResolution(settings);
    const atlas = worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, surfaceBake, wallHeight, cacheObj });
    if (!atlas) return;
    const flatCanvas = worldSurfaces.resolveWallAtlasCanvas(atlas.canvases, profileId, surfaceBake.gameTime);
    if (!flatCanvas || flatCanvas.isPlaceholder) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    const worldBounds = getViewportWorldBounds(viewport, settings.viewPaddingPx);
    const bleedPx = settings.wallTextureBleedPx ?? 1;
    const clampedHeight = Math.min(wallHeight, settings.cameraHeight - 1);
    const alphaMax = resolveElevationAlpha(clampedHeight, settings.cameraHeight);
    if (alphaMax <= 0) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample(settings);
    const edgeLen = cacheObj && cacheObj.edgeLen !== undefined ? cacheObj.edgeLen : Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const px = viewer.x;
    const py = viewer.y;
    const dist = Math.hypot(wallCx - px, wallCy - py);
    const subdivScale = Math.max(0.05, Math.min(1.0, 1.0 - (dist - settings.wallSubdivNearPx) / settings.wallSubdivFarPx));
    const heightCells = settings.wallHeightCells;
    const SUBDIV_X = Math.max(1, Math.min(2, Math.ceil((edgeLen / cellSize) * subdivScale)));
    const SUBDIV_Y = Math.max(1, Math.ceil(heightCells * subdivScale));
    const H_px = clampedHeight * ppwu;
    for (let row = 0; row < SUBDIV_Y; row++) {
        const bottomZ = row * (wallHeight / SUBDIV_Y);
        let topZ = (row + 1) * (wallHeight / SUBDIV_Y);
        if (bottomZ >= settings.cameraHeight) break;
        if (topZ >= settings.cameraHeight) topZ = settings.cameraHeight - 1;
        const alphaBottom = resolveElevationAlpha(bottomZ, settings.cameraHeight);
        const alphaTop = resolveElevationAlpha(topZ, settings.cameraHeight);
        const v0 = alphaBottom / alphaMax;
        const v1 = alphaTop / alphaMax;
        const sy0 = (row / SUBDIV_Y) * H_px;
        const sy1 = ((row + 1) / SUBDIV_Y) * H_px;
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
export function drawProjectedWallFace(
    ctx,
    p1,
    p2,
    px,
    py,
    fillStyle,
    worldSurfaces,
    surfaceBake,
    { viewport = null, damageAlpha = 0, textureEnabled = true, cacheObj = null, wallHeight = null, settings = null } = {},
) {
    const resolvedSettings = settings ?? worldSurfaces?.settings;
    if (!resolvedSettings) {
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
        return;
    }
    const finalWallHeight = wallHeight ?? getWallHeight(resolvedSettings);
    const face = computeProjectedFace(p1, p2, px, py, finalWallHeight, resolvedSettings);
    if (viewport) {
        const worldBounds = getViewportWorldBounds(viewport, resolvedSettings.viewPaddingPx);
        if (worldBounds) {
            sCorner0.x = p1.x;
            sCorner0.y = p1.y;
            sCorner1.x = p2.x;
            sCorner1.y = p2.y;
            sCorner2.x = face.proj2X;
            sCorner2.y = face.proj2Y;
            sCorner3.x = face.proj1X;
            sCorner3.y = face.proj1Y;
            if (!rowBoundsIntersects(sCorner0, sCorner1, sCorner2, sCorner3, worldBounds)) return;
        }
    }
    traceProjectedFace(ctx, p1, p2, face);
    if (worldSurfaces && surfaceBake && textureEnabled) drawFaceTexture(ctx, p1, p2, face, worldSurfaces, surfaceBake, { x: px, y: py }, viewport, finalWallHeight, fillStyle, cacheObj);
    else {
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
export function preloadProjectedWallFace(p1, p2, worldSurfaces, surfaceBake, cacheObj = null) {
    const settings = worldSurfaces?.settings;
    if (!settings) return;
    if (!worldSurfaces || !surfaceBake) return;
    const wallCx = cacheObj && cacheObj.cx !== undefined ? cacheObj.cx : (p1.x + p2.x) * 0.5;
    const wallCy = cacheObj && cacheObj.cy !== undefined ? cacheObj.cy : (p1.y + p2.y) * 0.5;
    const profileId = resolveWallProfileId(surfaceBake, wallCx, wallCy, cacheObj);
    const wallHeight = getWallHeight(settings);
    worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, surfaceBake, wallHeight, cacheObj });
}
