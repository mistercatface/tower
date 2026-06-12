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
/**
 * @typedef {Object} WallFaceAtlas
 * @property {CanvasImageSource & { width: number, height: number }} canvas
 * @property {number} bleedPx
 * @property {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @property {number} wallHeight
 * @property {number} edgeLen
 * @property {number} wallCx
 * @property {number} wallCy
 */
/**
 * @typedef {Object} WallFaceAtlasResolve
 * @property {WallFaceAtlas | null} atlas
 * @property {boolean} solidFill
 */
/**
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {WallDrawContext} wallCtx
 * @returns {WallFaceAtlasResolve}
 */
function resolveWallFaceAtlas(p1, p2, wallCtx) {
    const { worldSurfaces, proceduralSurfaceDraw, wallHeight, cacheObj } = wallCtx;
    const settings = worldSurfaces.settings;
    const wallCx = cacheObj?.cx ?? (p1.x + p2.x) * 0.5;
    const wallCy = cacheObj?.cy ?? (p1.y + p2.y) * 0.5;
    const profileId = resolveWallProfileId(proceduralSurfaceDraw, wallCx, wallCy, cacheObj);
    const baked = worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, proceduralSurfaceDraw, wallHeight, cacheObj });
    if (!baked) return { atlas: null, solidFill: false };
    const canvas = baked.canvases[0];
    if (!canvas || canvas.isPlaceholder) return { atlas: null, solidFill: true };
    return { atlas: { canvas, bleedPx: settings.wallTextureBleedPx ?? 1, settings, wallHeight, edgeLen: cacheObj?.edgeLen ?? Math.hypot(p2.x - p1.x, p2.y - p1.y), wallCx, wallCy }, solidFill: false };
}
/**
 * @typedef {Object} WallFaceSubdiv
 * @property {number} subdivX
 * @property {number} subdivY
 * @property {number} hPx
 * @property {number} alphaMax
 */
/**
 * @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @param {number} wallHeight
 * @param {number} edgeLen
 * @param {number} wallCx
 * @param {number} wallCy
 * @param {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 * @returns {WallFaceSubdiv | null}
 */
function computeWallFaceSubdiv(settings, wallHeight, edgeLen, wallCx, wallCy, camera) {
    const cellSize = settings.cellSize;
    const clampedHeight = Math.min(wallHeight, camera.cameraHeight - 1);
    const alphaMax = resolveElevationAlpha(clampedHeight, camera);
    if (alphaMax <= 0) return null;
    const dist = Math.hypot(wallCx - camera.viewerX, wallCy - camera.viewerY);
    const subdivScale = Math.max(0.05, Math.min(1.0, 1.0 - (dist - settings.wallSubdivNearPx) / settings.wallSubdivFarPx));
    const visibleHeightCells = clampedHeight / cellSize;
    return {
        subdivX: Math.max(1, Math.min(2, Math.ceil((edgeLen / cellSize) * subdivScale))),
        subdivY: Math.max(1, Math.ceil(visibleHeightCells * subdivScale)),
        hPx: clampedHeight * getTexelResolution(settings),
        alphaMax,
    };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {ReturnType<typeof computeProjectedFace>} face
 * @param {WallFaceAtlas} atlas
 * @param {WallFaceSubdiv} subdiv
 * @param {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 * @param {import("../../Math/Aabb2D.js").Aabb2D} worldBounds
 */
function blitWallFaceSubdiv(ctx, p1, p2, face, atlas, subdiv, camera, worldBounds) {
    const { canvas, bleedPx, settings, wallHeight } = atlas;
    const { subdivX, subdivY, hPx, alphaMax } = subdiv;
    const rowStep = wallHeight / subdivY;
    const cameraHeight = settings.cameraHeight;
    const visibleRows = Math.min(subdivY, Math.ceil(cameraHeight / rowStep));
    ctx.save();
    for (let row = 0; row < visibleRows; row++) {
        const bottomZ = row * rowStep;
        let topZ = (row + 1) * rowStep;
        if (topZ >= cameraHeight) topZ = cameraHeight - 1;
        const v0 = resolveElevationAlpha(bottomZ, camera) / alphaMax;
        const v1 = resolveElevationAlpha(topZ, camera) / alphaMax;
        const sy0 = (row / subdivY) * hPx;
        const sy1 = ((row + 1) / subdivY) * hPx;
        for (let col = 0; col < subdivX; col++) {
            const u0 = col / subdivX;
            const u1 = (col + 1) / subdivX;
            computeFaceCorner(sCorner0, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u0, v0);
            computeFaceCorner(sCorner1, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u1, v0);
            computeFaceCorner(sCorner2, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u1, v1);
            computeFaceCorner(sCorner3, p1, p2, face.proj1X, face.proj1Y, face.proj2X, face.proj2Y, u0, v1);
            if (!pointsAabbOverlapAabb(sCorner0, sCorner1, sCorner2, sCorner3, worldBounds)) continue;
            drawImageQuad(ctx, { img: canvas, sx0: u0 * canvas.width, sy0, sx1: u1 * canvas.width, sy1, d0: sCorner0, d1: sCorner1, d2: sCorner2, d3: sCorner3 }, { bleedPx });
        }
    }
    ctx.restore();
}
/** @param {ReturnType<typeof computeProjectedFace>} face @param {WallDrawContext} wallCtx @param {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera */
function drawFaceTexture(ctx, p1, p2, face, wallCtx, camera) {
    const { atlas, solidFill } = resolveWallFaceAtlas(p1, p2, wallCtx);
    if (!atlas) {
        if (solidFill) {
            ctx.fillStyle = wallCtx.fillStyle;
            ctx.fill();
        }
        return;
    }
    const subdiv = computeWallFaceSubdiv(atlas.settings, atlas.wallHeight, atlas.edgeLen, atlas.wallCx, atlas.wallCy, camera);
    if (!subdiv) {
        ctx.fillStyle = wallCtx.fillStyle;
        ctx.fill();
        return;
    }
    blitWallFaceSubdiv(ctx, p1, p2, face, atlas, subdiv, camera, wallCtx.worldBounds);
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
    const { wallHeight, viewport, worldSurfaces, proceduralSurfaceDraw, fillStyle, damageAlpha, camera: passCamera } = wallCtx;
    const camera = passCamera ?? elevationCameraFromViewport(viewport, worldSurfaces.settings.cameraHeight);
    const face = computeProjectedFace(p1, p2, wallHeight, camera);
    traceProjectedFace(ctx, p1, p2, face);
    if (proceduralSurfaceDraw) drawFaceTexture(ctx, p1, p2, face, wallCtx, camera);
    else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (damageAlpha > 0) drawDamageOverlayInClip(ctx, damageAlpha, (clipCtx) => appendProjectedFace(clipCtx, p1, p2, face));
}
