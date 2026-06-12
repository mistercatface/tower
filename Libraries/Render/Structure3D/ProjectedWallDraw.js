/**
 * Projects wall faces in isometric space and samples baked atlases from WorldSurfaceEngine.
 * Roof caps are chunk-cached horizontal surfaces (WorldSurfaceEngine.drawRoofLayers).
 */
import { drawImageQuad } from "../../Canvas/AffineTexture.js";
/** @typedef {import("../WorldSceneTypes.js").ProceduralSurfaceDrawContext} ProceduralSurfaceDrawContext */
import { getTexelResolution } from "../../WorldSurface/WorldSurfaceResolution.js";
import { resolveElevationAlpha } from "../../Spatial/iso/IsometricProjection.js";
import { pointsAabbOverlapAabb } from "../../Math/Aabb2D.js";
import { traceQuad } from "../../Canvas/CanvasPath.js";
import { drawDamageOverlayInClip } from "./wallDamageVisual.js";
/** @typedef {import("./WallDrawContext.js").WallDrawContext} WallDrawContext */
export { wallFaceColumns } from "../../WorldSurface/WallFaceColumns.js";
const WALL_ANGLE_SPREAD = 0.002;
const sCorner0 = { x: 0, y: 0 };
const sCorner1 = { x: 0, y: 0 };
const sCorner2 = { x: 0, y: 0 };
const sCorner3 = { x: 0, y: 0 };
export const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sFaceBottom = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
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
/** @param {ReturnType<typeof computeProjectedFace>} faceBottom @param {ReturnType<typeof computeProjectedFace>} faceTop */
export function appendProjectedFaceBand(ctx, faceBottom, faceTop) {
    traceQuad(ctx, { x: faceBottom.proj1X, y: faceBottom.proj1Y }, { x: faceTop.proj1X, y: faceTop.proj1Y }, { x: faceTop.proj2X, y: faceTop.proj2Y }, { x: faceBottom.proj2X, y: faceBottom.proj2Y });
}
export function appendProjectedFace(ctx, p1, p2, face) {
    traceQuad(ctx, p1, { x: face.proj1X, y: face.proj1Y }, { x: face.proj2X, y: face.proj2Y }, p2);
}
/** @param {ReturnType<typeof computeProjectedFace>} faceBottom @param {ReturnType<typeof computeProjectedFace>} faceTop */
export function traceProjectedFaceBand(ctx, faceBottom, faceTop) {
    ctx.beginPath();
    appendProjectedFaceBand(ctx, faceBottom, faceTop);
}
export function traceProjectedFace(ctx, p1, p2, face) {
    ctx.beginPath();
    appendProjectedFace(ctx, p1, p2, face);
}
function computeFaceCornerElevated(out, u, v, faceBottom, faceTop) {
    const bot1X = faceBottom.proj1X;
    const bot1Y = faceBottom.proj1Y;
    const bot2X = faceBottom.proj2X;
    const bot2Y = faceBottom.proj2Y;
    const top1X = faceTop.proj1X;
    const top1Y = faceTop.proj1Y;
    const top2X = faceTop.proj2X;
    const top2Y = faceTop.proj2Y;
    const bx = bot1X + (bot2X - bot1X) * u;
    const by = bot1Y + (bot2Y - bot1Y) * u;
    const tx = top1X + (top2X - top1X) * u;
    const ty = top1Y + (top2Y - top1Y) * u;
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
 * @property {number} capHeight
 * @property {number} bandHeight
 * @property {number} wallBaseZ
 * @property {number} edgeLen
 * @property {number} wallCx
 * @property {number} wallCy
 */
/**
 * @typedef {Object} WallFaceAtlasResolve
 * @property {WallFaceAtlas | null} atlas
 * @property {boolean} solidFill
 */
function resolveWallFaceAtlas(p1, p2, wallCtx) {
    const { worldSurfaces, proceduralSurfaceDraw, wallHeight, wallBaseZ, wallCapHeight, cacheObj } = wallCtx;
    const settings = worldSurfaces.settings;
    const wallCx = (p1.x + p2.x) * 0.5;
    const wallCy = (p1.y + p2.y) * 0.5;
    const profileId = resolveWallProfileId(proceduralSurfaceDraw, wallCx, wallCy, cacheObj);
    const baked = worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, proceduralSurfaceDraw, wallHeight: wallCapHeight, cacheObj });
    if (!baked) return { atlas: null, solidFill: false };
    const canvas = baked.canvases[0];
    if (!canvas || canvas.isPlaceholder) return { atlas: null, solidFill: true };
    return {
        atlas: {
            canvas,
            bleedPx: settings.wallTextureBleedPx ?? 1,
            settings,
            capHeight: wallCapHeight,
            bandHeight: wallHeight,
            wallBaseZ,
            edgeLen: Math.hypot(p2.x - p1.x, p2.y - p1.y),
            wallCx,
            wallCy,
        },
        solidFill: false,
    };
}
/**
 * @typedef {Object} WallFaceSubdiv
 * @property {number} subdivX
 * @property {number} subdivY
 * @property {number} capPx
 * @property {number} alphaBase
 * @property {number} alphaBandMax
 */
function computeWallFaceSubdiv(settings, bandHeight, capHeight, wallBaseZ, edgeLen, wallCx, wallCy, camera) {
    const cellSize = settings.cellSize;
    const topZ = Math.min(wallBaseZ + bandHeight, camera.cameraHeight - 1);
    const alphaBandMax = resolveElevationAlpha(topZ, camera);
    const alphaBase = resolveElevationAlpha(wallBaseZ, camera);
    if (alphaBandMax <= alphaBase) return null;
    const dist = Math.hypot(wallCx - camera.viewerX, wallCy - camera.viewerY);
    const subdivScale = Math.max(0.05, Math.min(1.0, 1.0 - (dist - settings.wallSubdivNearPx) / settings.wallSubdivFarPx));
    const visibleHeightCells = bandHeight / cellSize;
    return {
        subdivX: Math.max(1, Math.min(2, Math.ceil((edgeLen / cellSize) * subdivScale))),
        subdivY: Math.max(1, Math.ceil(visibleHeightCells * subdivScale)),
        capPx: capHeight * getTexelResolution(settings),
        alphaBase,
        alphaBandMax,
    };
}
function blitWallFaceSubdiv(ctx, faceBottom, faceTop, atlas, subdiv, camera, worldBounds) {
    const { canvas, bleedPx, settings, capHeight, bandHeight, wallBaseZ } = atlas;
    const { subdivX, subdivY, capPx, alphaBase, alphaBandMax } = subdiv;
    const alphaSpan = alphaBandMax - alphaBase;
    const rowStep = bandHeight / subdivY;
    const cameraHeight = settings.cameraHeight;
    const visibleRows = Math.min(subdivY, Math.ceil((cameraHeight - wallBaseZ) / rowStep));
    ctx.save();
    for (let row = 0; row < visibleRows; row++) {
        const bottomZ = wallBaseZ + row * rowStep;
        let topZ = wallBaseZ + (row + 1) * rowStep;
        if (bottomZ >= cameraHeight) break;
        if (topZ >= cameraHeight) topZ = cameraHeight - 1;
        const v0 = (resolveElevationAlpha(bottomZ, camera) - alphaBase) / alphaSpan;
        const v1 = (resolveElevationAlpha(topZ, camera) - alphaBase) / alphaSpan;
        const sy0 = (bottomZ / capHeight) * capPx;
        const sy1 = (topZ / capHeight) * capPx;
        for (let col = 0; col < subdivX; col++) {
            const u0 = col / subdivX;
            const u1 = (col + 1) / subdivX;
            computeFaceCornerElevated(sCorner0, u0, v0, faceBottom, faceTop);
            computeFaceCornerElevated(sCorner1, u1, v0, faceBottom, faceTop);
            computeFaceCornerElevated(sCorner2, u1, v1, faceBottom, faceTop);
            computeFaceCornerElevated(sCorner3, u0, v1, faceBottom, faceTop);
            if (!pointsAabbOverlapAabb(sCorner0, sCorner1, sCorner2, sCorner3, worldBounds)) continue;
            drawImageQuad(ctx, { img: canvas, sx0: u0 * canvas.width, sy0, sx1: u1 * canvas.width, sy1, d0: sCorner0, d1: sCorner1, d2: sCorner2, d3: sCorner3 }, { bleedPx });
        }
    }
    ctx.restore();
}
function drawFaceTexture(ctx, p1, p2, faceBottom, faceTop, wallCtx, camera) {
    const { atlas, solidFill } = resolveWallFaceAtlas(p1, p2, wallCtx);
    if (!atlas) {
        if (solidFill) {
            ctx.fillStyle = wallCtx.fillStyle;
            ctx.fill();
        }
        return;
    }
    const subdiv = computeWallFaceSubdiv(atlas.settings, atlas.bandHeight, atlas.capHeight, atlas.wallBaseZ, atlas.edgeLen, atlas.wallCx, atlas.wallCy, camera);
    if (!subdiv) {
        ctx.fillStyle = wallCtx.fillStyle;
        ctx.fill();
        return;
    }
    blitWallFaceSubdiv(ctx, faceBottom, faceTop, atlas, subdiv, camera, wallCtx.worldBounds);
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
    const { wallHeight, wallBaseZ, proceduralSurfaceDraw, fillStyle, damageAlpha, camera } = wallCtx;
    const topZ = wallBaseZ + wallHeight;
    const faceBottom = computeProjectedFace(p1, p2, wallBaseZ, camera, sFaceBottom);
    const faceTop = computeProjectedFace(p1, p2, topZ, camera, sharedScratchFace);
    traceProjectedFaceBand(ctx, faceBottom, faceTop);
    if (proceduralSurfaceDraw) drawFaceTexture(ctx, p1, p2, faceBottom, faceTop, wallCtx, camera);
    else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (damageAlpha > 0) drawDamageOverlayInClip(ctx, damageAlpha, (clipCtx) => appendProjectedFaceBand(clipCtx, faceBottom, faceTop));
}
