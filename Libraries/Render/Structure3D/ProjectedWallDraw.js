/**
 * Projects wall faces in isometric space and samples baked atlases from WorldSurfaceEngine.
 * Vertical bands: projectWorldPointInto. Horizontal caps: box top ring + per-corner chunk UV.
 */
import { drawImageQuad, drawImageTriangle } from "../../Canvas/AffineTexture.js";
import { resolveElevationAlpha, projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
import { railWallCapUvCornersInto } from "../../World/wallGridBake.js";
import { pointsAabbOverlapAabb } from "../../Math/Aabb2D.js";
import { traceQuad, traceClosedPolygon } from "../../Canvas/CanvasPath.js";
import { applyProjectedCapDamageOverlay, applyProjectedWallFaceDamageOverlay } from "./wallDamageDraw.js";
export const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sFaceBottom = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sBandPoint0 = { x: 0, y: 0 };
const sBandPoint1 = { x: 0, y: 0 };
const sCorner0 = { x: 0, y: 0 };
const sCorner1 = { x: 0, y: 0 };
const sCorner2 = { x: 0, y: 0 };
const sCorner3 = { x: 0, y: 0 };
const sCapCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
const sWallFaceAtlas = { canvas: null, settings: null, capHeight: 0, bandHeight: 0, wallBaseZ: 0, edgeLen: 0, wallCx: 0, wallCy: 0 };
export function appendProjectedFaceBand(ctx, faceBottom, faceTop) {
    traceQuad(ctx, { x: faceBottom.proj1X, y: faceBottom.proj1Y }, { x: faceTop.proj1X, y: faceTop.proj1Y }, { x: faceTop.proj2X, y: faceTop.proj2Y }, { x: faceBottom.proj2X, y: faceBottom.proj2Y });
}
export function traceProjectedFaceBand(ctx, faceBottom, faceTop) {
    ctx.beginPath();
    appendProjectedFaceBand(ctx, faceBottom, faceTop);
}
/**
 * Project one horizontal edge of a wall band at fixed world Z.
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {number} z
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {ProjectedWallBand} out
 */
export function projectWallFaceBandInto(p1, p2, z, viewport, out) {
    projectWorldPointInto(sBandPoint0, p1.x, p1.y, z, viewport);
    projectWorldPointInto(sBandPoint1, p2.x, p2.y, z, viewport);
    out.proj1X = sBandPoint0.x;
    out.proj1Y = sBandPoint0.y;
    out.proj2X = sBandPoint1.x;
    out.proj2Y = sBandPoint1.y;
    return out;
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
 * @property {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @property {number} capHeight
 * @property {number} bandHeight
 * @property {number} wallBaseZ
 * @property {number} edgeLen
 * @property {number} wallCx
 * @property {number} wallCy
 */
/** @returns {typeof sWallFaceAtlas | null | 'solid'} */
function resolveWallFaceAtlas(p1, p2, wallCtx) {
    const { worldSurfaces, proceduralSurfaceDraw, wallHeight, wallBaseZ, wallCapHeight, cacheObj, atlasFaceId } = wallCtx;
    const settings = worldSurfaces.settings;
    const wallCx = (p1.x + p2.x) * 0.5;
    const wallCy = (p1.y + p2.y) * 0.5;
    const profileId = resolveWallProfileId(proceduralSurfaceDraw, wallCx, wallCy, cacheObj);
    const baked = worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, proceduralSurfaceDraw, wallHeight: wallCapHeight, cacheObj, atlasFaceId: atlasFaceId ?? "side" });
    if (!baked) return null;
    const canvas = baked.canvases[0];
    if (!canvas || canvas.isPlaceholder) return "solid";
    const atlas = sWallFaceAtlas;
    atlas.canvas = canvas;
    atlas.settings = settings;
    atlas.capHeight = wallCapHeight;
    atlas.bandHeight = wallHeight;
    atlas.wallBaseZ = wallBaseZ;
    atlas.edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    atlas.wallCx = wallCx;
    atlas.wallCy = wallCy;
    return atlas;
}
/**
 * @typedef {Object} WallFaceSubdiv
 * @property {number} subdivX
 * @property {number} subdivY
 * @property {number} capPx
 * @property {number} alphaBase
 * @property {number} alphaBandMax
 */
function computeWallFaceSubdiv(settings, bandHeight, capHeight, wallBaseZ, edgeLen, wallCx, wallCy, viewport) {
    const cellSize = settings.cellSize;
    const topZ = Math.min(wallBaseZ + bandHeight, viewport.cameraHeight - 1);
    const alphaBandMax = resolveElevationAlpha(topZ, viewport);
    const alphaBase = resolveElevationAlpha(wallBaseZ, viewport);
    if (alphaBandMax <= alphaBase) return null;
    const dist = Math.hypot(wallCx - viewport.x, wallCy - viewport.y);
    const subdivScale = Math.max(0.05, Math.min(1.0, 1.0 - (dist - settings.wallSubdivNearPx) / settings.wallSubdivFarPx));
    const visibleHeightCells = bandHeight / cellSize;
    return {
        subdivX: Math.max(1, Math.min(2, Math.ceil((edgeLen / cellSize) * subdivScale))),
        subdivY: Math.max(1, Math.ceil(visibleHeightCells * subdivScale)),
        capPx: capHeight * settings.surfaceBakeScale,
        alphaBase,
        alphaBandMax,
    };
}
function blitWallFaceSubdiv(ctx, faceBottom, faceTop, atlas, subdiv, viewport, worldBounds) {
    const { canvas, capHeight, bandHeight, wallBaseZ } = atlas;
    const { subdivX, subdivY, capPx, alphaBase, alphaBandMax } = subdiv;
    const alphaSpan = alphaBandMax - alphaBase;
    const rowStep = bandHeight / subdivY;
    const cameraHeight = viewport.cameraHeight;
    const visibleRows = Math.min(subdivY, Math.ceil((cameraHeight - wallBaseZ) / rowStep));
    for (let row = 0; row < visibleRows; row++) {
        const bottomZ = wallBaseZ + row * rowStep;
        let topZ = wallBaseZ + (row + 1) * rowStep;
        if (bottomZ >= cameraHeight) break;
        if (topZ >= cameraHeight) topZ = cameraHeight - 1;
        const v0 = (resolveElevationAlpha(bottomZ, viewport) - alphaBase) / alphaSpan;
        const v1 = (resolveElevationAlpha(topZ, viewport) - alphaBase) / alphaSpan;
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
            drawImageQuad(ctx, canvas, u0 * canvas.width, sy0, u1 * canvas.width, sy1, sCorner0, sCorner1, sCorner2, sCorner3);
        }
    }
}
function resolveWallFaceSubdiv(wallCtx, atlas, viewport) {
    const cacheObj = wallCtx.cacheObj;
    const faceId = wallCtx.atlasFaceId ?? "side";
    const subdivKey = `${faceId}|${atlas.edgeLen}|${viewport.x}|${viewport.y}|${atlas.wallBaseZ}|${atlas.bandHeight}`;
    if (cacheObj && cacheObj._faceSubdivKey === subdivKey) return cacheObj._faceSubdiv;
    const subdiv = computeWallFaceSubdiv(atlas.settings, atlas.bandHeight, atlas.capHeight, atlas.wallBaseZ, atlas.edgeLen, atlas.wallCx, atlas.wallCy, viewport);
    if (cacheObj) {
        cacheObj._faceSubdivKey = subdivKey;
        cacheObj._faceSubdiv = subdiv;
    }
    return subdiv;
}
function drawFaceTexture(ctx, p1, p2, faceBottom, faceTop, wallCtx, viewport) {
    const atlas = resolveWallFaceAtlas(p1, p2, wallCtx);
    if (atlas === null) return;
    if (atlas === "solid") {
        ctx.fillStyle = wallCtx.fillStyle;
        ctx.fill();
        return;
    }
    const subdiv = resolveWallFaceSubdiv(wallCtx, atlas, viewport);
    if (!subdiv) {
        ctx.fillStyle = wallCtx.fillStyle;
        ctx.fill();
        return;
    }
    blitWallFaceSubdiv(ctx, faceBottom, faceTop, atlas, subdiv, viewport, wallCtx.worldBounds);
}
const sCapSrc0 = { x: 0, y: 0 };
const sCapSrc1 = { x: 0, y: 0 };
const sCapSrc2 = { x: 0, y: 0 };
const sCapSrc3 = { x: 0, y: 0 };
const sCapSrc = [sCapSrc0, sCapSrc1, sCapSrc2, sCapSrc3];
const sCapUv0 = { x: 0, y: 0 };
const sCapUv1 = { x: 0, y: 0 };
const sCapUv2 = { x: 0, y: 0 };
const sCapUv3 = { x: 0, y: 0 };
const sCapUv = [sCapUv0, sCapUv1, sCapUv2, sCapUv3];
/**
 * Top ring of a railWall box at wallCapHeight — same corners the long/end faces meet.
 * Order: outerP1 → outerP2 → innerP2 → innerP1.
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} out4
 * @param {{ outerP1x: number, outerP1y: number, outerP2x: number, outerP2y: number, innerP1x: number, innerP1y: number, innerP2x: number, innerP2y: number, wallCapHeight: number }} box
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function projectRailWallTopCornersInto(out4, box, viewport) {
    const z = box.wallCapHeight;
    projectWorldPointInto(out4[0], box.outerP1x, box.outerP1y, z, viewport);
    projectWorldPointInto(out4[1], box.outerP2x, box.outerP2y, z, viewport);
    projectWorldPointInto(out4[2], box.innerP2x, box.innerP2y, z, viewport);
    projectWorldPointInto(out4[3], box.innerP1x, box.innerP1y, z, viewport);
    return out4;
}
function fillProjectedCapPolygon(ctx, corners, fillStyle) {
    ctx.beginPath();
    traceClosedPolygon(ctx, corners);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}
function blitHorizontalCapSample(ctx, dest4, src4, canvas) {
    drawImageTriangle(ctx, canvas, src4[0], src4[1], src4[3], dest4[0], dest4[1], dest4[3]);
    drawImageTriangle(ctx, canvas, src4[1], src4[2], src4[3], dest4[1], dest4[2], dest4[3]);
}
/**
 * railWall top cap — projects box top ring and samples/draws procedural texture cap.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} box
 * @param {WallDrawContext} wallCtx
 */
export function drawProjectedRailWallCap(ctx, box, wallCtx) {
    const { worldSurfaces, proceduralSurfaceDraw, fillStyle, viewport, gameState } = wallCtx;
    projectRailWallTopCornersInto(sCapCorners, box, viewport);
    if (!proceduralSurfaceDraw || !gameState) {
        fillProjectedCapPolygon(ctx, sCapCorners, fillStyle);
        if (wallCtx.damageTintRatio > 0) applyProjectedCapDamageOverlay(ctx, sCapCorners, wallCtx.damageTintRatio);
        return;
    }
    const profileId = resolveWallProfileId(proceduralSurfaceDraw, box.cx, box.cy, wallCtx.cacheObj);
    railWallCapUvCornersInto(sCapUv, gameState.obstacleGrid, box);
    const capCanvas = worldSurfaces.fillHorizontalCapDrawSampleInto(sCapUv, box.wallCapHeight, gameState, profileId, sCapSrc);
    if (!capCanvas) {
        fillProjectedCapPolygon(ctx, sCapCorners, fillStyle);
        if (wallCtx.damageTintRatio > 0) applyProjectedCapDamageOverlay(ctx, sCapCorners, wallCtx.damageTintRatio);
        return;
    }
    blitHorizontalCapSample(ctx, sCapCorners, sCapSrc, capCanvas);
    if (wallCtx.damageTintRatio > 0) applyProjectedCapDamageOverlay(ctx, sCapCorners, wallCtx.damageTintRatio);
}
/**
 * Horizontal cap from world AABB corners (voxelBlock caps, generic quads).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} minX
 * @param {number} minY
 * @param {number} maxX
 * @param {number} maxY
 * @param {number} z
 * @param {WallDrawContext} wallCtx
 */
export function drawProjectedHorizontalCap(ctx, minX, minY, maxX, maxY, z, wallCtx) {
    const { worldSurfaces, proceduralSurfaceDraw, fillStyle, viewport, gameState } = wallCtx;
    projectRailWallTopCornersInto(
        sCapCorners,
        { outerP1x: minX, outerP1y: minY, outerP2x: maxX, outerP2y: minY, innerP2x: maxX, innerP2y: maxY, innerP1x: minX, innerP1y: maxY, wallCapHeight: z },
        viewport,
    );
    if (!proceduralSurfaceDraw || !gameState) {
        fillProjectedCapPolygon(ctx, sCapCorners, fillStyle);
        if (wallCtx.damageTintRatio > 0) applyProjectedCapDamageOverlay(ctx, sCapCorners, wallCtx.damageTintRatio);
        return;
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const profileId = resolveWallProfileId(proceduralSurfaceDraw, cx, cy, wallCtx.cacheObj);
    sCapUv0.x = minX;
    sCapUv0.y = minY;
    sCapUv1.x = maxX;
    sCapUv1.y = minY;
    sCapUv2.x = maxX;
    sCapUv2.y = maxY;
    sCapUv3.x = minX;
    sCapUv3.y = maxY;
    const capCanvas = worldSurfaces.fillHorizontalCapDrawSampleInto(sCapUv, z, gameState, profileId, sCapSrc);
    if (!capCanvas) {
        fillProjectedCapPolygon(ctx, sCapCorners, fillStyle);
        if (wallCtx.damageTintRatio > 0) applyProjectedCapDamageOverlay(ctx, sCapCorners, wallCtx.damageTintRatio);
        return;
    }
    blitHorizontalCapSample(ctx, sCapCorners, sCapSrc, capCanvas);
    if (wallCtx.damageTintRatio > 0) applyProjectedCapDamageOverlay(ctx, sCapCorners, wallCtx.damageTintRatio);
}
/**
 * Wall face draw: projectWorldPointInto band → trace → texture or solid fill → optional damage overlay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {WallDrawContext} wallCtx
 */
export function drawProjectedWallFace(ctx, p1, p2, wallCtx) {
    const { wallHeight, wallBaseZ, proceduralSurfaceDraw, fillStyle, viewport, damageTintRatio = 0 } = wallCtx;
    const topZ = wallBaseZ + wallHeight;
    const faceBottom = projectWallFaceBandInto(p1, p2, wallBaseZ, viewport, sFaceBottom);
    const faceTop = projectWallFaceBandInto(p1, p2, topZ, viewport, sharedScratchFace);
    traceProjectedFaceBand(ctx, faceBottom, faceTop);
    if (proceduralSurfaceDraw) drawFaceTexture(ctx, p1, p2, faceBottom, faceTop, wallCtx, viewport);
    else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (damageTintRatio > 0) applyProjectedWallFaceDamageOverlay(ctx, faceBottom, faceTop, damageTintRatio);
}
