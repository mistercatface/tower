/**
 * Projects wall faces in isometric space and samples baked atlases from WorldSurfaceEngine.
 * Roof caps are chunk-cached horizontal surfaces (WorldSurfaceEngine.drawRoofLayers).
 */
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
import { drawImageQuad } from "../../Canvas/AffineTexture.js";
/** @typedef {import("../WorldSceneTypes.js").ProceduralSurfaceDrawContext} ProceduralSurfaceDrawContext */
import { getTexelResolution } from "../../WorldSurface/WorldSurfaceResolution.js";
import { elevationCameraFromViewport } from "../../Spatial/iso/ElevationCamera.js";
import { resolveElevationAlpha } from "../../Spatial/iso/IsometricProjection.js";
import { pointsAabbOverlapAabb } from "../../Math/Aabb2D.js";
import { traceQuad } from "../../Canvas/CanvasPath.js";
import { drawDamageOverlayInClip } from "./wallDamageVisual.js";
/** @typedef {import("./WallDrawContext.js").WallDrawContext} WallDrawContext */
export { getWallHeight };
export { wallFaceColumns } from "../../WorldSurface/WallFaceColumns.js";
const WALL_ANGLE_SPREAD = 0.002;
const sCorner0 = { x: 0, y: 0 };
const sCorner1 = { x: 0, y: 0 };
const sCorner2 = { x: 0, y: 0 };
const sCorner3 = { x: 0, y: 0 };
export const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
export function computeProjectedFace(p1, p2, wallHeight, camera, out = sharedScratchFace) {
    const px = camera.viewerX;
    const py = camera.viewerY;
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
    const clampedHeight = Math.min(wallHeight, camera.cameraHeight - 1);
    const alpha = resolveElevationAlpha(clampedHeight, camera);
    out.proj1X = p1.x + Math.cos(angle1) * dist1 * alpha;
    out.proj1Y = p1.y + Math.sin(angle1) * dist1 * alpha;
    out.proj2X = p2.x + Math.cos(angle2) * dist2 * alpha;
    out.proj2Y = p2.y + Math.sin(angle2) * dist2 * alpha;
    return out;
}
export function appendProjectedFace(ctx, p1, p2, face) {
    traceQuad(ctx, p1, { x: face.proj1X, y: face.proj1Y }, { x: face.proj2X, y: face.proj2Y }, p2);
}
export function traceProjectedFace(ctx, p1, p2, face) {
    ctx.beginPath();
    appendProjectedFace(ctx, p1, p2, face);
}
function computeFaceCorner(out, p1, p2, proj1X, proj1Y, proj2X, proj2Y, u, v) {
    const bx = p1.x + (p2.x - p1.x) * u;
    const by = p1.y + (p2.y - p1.y) * u;
    const tx = proj1X + (proj2X - proj1X) * u;
    const ty = proj1Y + (proj2Y - proj1Y) * u;
    out.x = bx + (tx - bx) * v;
    out.y = by + (ty - by) * v;
}
function resolveWallProfileId(proceduralSurfaceDraw, wallCx, wallCy, cacheObj) {
    if (cacheObj?.surfaceProfileId) return cacheObj.surfaceProfileId;
    let profileId = cacheObj && cacheObj._cachedProfileId ? cacheObj._cachedProfileId : null;
    if (!profileId || proceduralSurfaceDraw.surfaceProfileOverride) {
        profileId = proceduralSurfaceDraw.resolveProfileAt(wallCx, wallCy);
        if (cacheObj && !proceduralSurfaceDraw.surfaceProfileOverride) cacheObj._cachedProfileId = profileId;
    }
    return profileId;
}
/** @param {ReturnType<typeof computeProjectedFace>} face @param {WallDrawContext} wallCtx @param {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera */
function drawFaceTexture(ctx, p1, p2, face, wallCtx, camera) {
    const { worldSurfaces, proceduralSurfaceDraw, wallHeight, fillStyle, cacheObj, worldBounds } = wallCtx;
    const settings = worldSurfaces.settings;
    const cellSize = settings.cellSize;
    const wallCx = cacheObj?.cx ?? (p1.x + p2.x) * 0.5;
    const wallCy = cacheObj?.cy ?? (p1.y + p2.y) * 0.5;
    const profileId = resolveWallProfileId(proceduralSurfaceDraw, wallCx, wallCy, cacheObj);
    const ppwu = getTexelResolution(settings);
    const atlas = worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, proceduralSurfaceDraw, wallHeight, cacheObj });
    if (!atlas) return;
    const flatCanvas = atlas.canvases[0];
    if (!flatCanvas || flatCanvas.isPlaceholder) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    const bleedPx = settings.wallTextureBleedPx ?? 1;
    const clampedHeight = Math.min(wallHeight, camera.cameraHeight - 1);
    const alphaMax = resolveElevationAlpha(clampedHeight, camera);
    if (alphaMax <= 0) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    ctx.save();
    const edgeLen = cacheObj?.edgeLen ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const dist = Math.hypot(wallCx - camera.viewerX, wallCy - camera.viewerY);
    const subdivScale = Math.max(0.05, Math.min(1.0, 1.0 - (dist - settings.wallSubdivNearPx) / settings.wallSubdivFarPx));
    const visibleHeightCells = clampedHeight / cellSize;
    const SUBDIV_X = Math.max(1, Math.min(2, Math.ceil((edgeLen / cellSize) * subdivScale)));
    const SUBDIV_Y = Math.max(1, Math.ceil(visibleHeightCells * subdivScale));
    const H_px = clampedHeight * ppwu;
    for (let row = 0; row < SUBDIV_Y; row++) {
        const bottomZ = row * (wallHeight / SUBDIV_Y);
        let topZ = (row + 1) * (wallHeight / SUBDIV_Y);
        if (bottomZ >= settings.cameraHeight) break;
        if (topZ >= settings.cameraHeight) topZ = settings.cameraHeight - 1;
        const alphaBottom = resolveElevationAlpha(bottomZ, camera);
        const alphaTop = resolveElevationAlpha(topZ, camera);
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
            if (!pointsAabbOverlapAabb(sCorner0, sCorner1, sCorner2, sCorner3, worldBounds)) continue;
            const sx0 = u0 * flatCanvas.width;
            const sx1 = u1 * flatCanvas.width;
            drawImageQuad(ctx, { img: flatCanvas, sx0, sy0, sx1, sy1, d0: sCorner0, d1: sCorner1, d2: sCorner2, d3: sCorner3 }, { bleedPx });
        }
    }
    ctx.restore();
}
/**
 * Shared wall-face draw: project → trace → texture or solid fill → optional damage overlay.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {WallDrawContext} wallCtx
 */
export function drawProjectedWallFace(ctx, p1, p2, wallCtx) {
    const { wallHeight, viewport, worldSurfaces, proceduralSurfaceDraw, fillStyle, damageAlpha } = wallCtx;
    const camera = elevationCameraFromViewport(viewport, worldSurfaces.settings.cameraHeight);
    const face = computeProjectedFace(p1, p2, wallHeight, camera);
    traceProjectedFace(ctx, p1, p2, face);
    if (proceduralSurfaceDraw) drawFaceTexture(ctx, p1, p2, face, wallCtx, camera);
    else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (damageAlpha > 0) drawDamageOverlayInClip(ctx, damageAlpha, (clipCtx) => appendProjectedFace(clipCtx, p1, p2, face));
}
