/**
 * Projects wall faces via radial elevation projection and samples baked atlases from WorldSurfaceEngine.
 * Vertical bands: projectWorldPointInto. Horizontal caps: box top ring + per-corner chunk UV.
 */
import { drawImageQuadWithBaseTransformScalars, drawImageTriangleWithBaseTransformScalars } from "../../Canvas/AffineTexture.js";
import { resolveElevationAlpha, projectWorldPointInto, projectWorldQuadInto } from "../../Spatial/elevation/RadialElevationProjection.js";
import { flatRailWallCapUvCornersIntoFlat, resolveWallCapHeightPx, RAIL_BOX } from "../../World/wallGridBake.js";
import { pointsAabbOverlapAabb, flatQuadOverlapAabb } from "../../Math/Aabb2D.js";
import { traceClosedFlatPolygon, traceFlatQuad } from "../../Canvas/CanvasPath.js";
import { gameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { resolveWallSurfaceProfileId } from "../../Spatial/grid/SurfaceMaterialStore.js";
const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sFaceBottom = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sSubdivQuad = new Float32Array(8);
const sFlatCapCorners = new Float32Array(8);
const sFlatCapUv = new Float32Array(8);
const sFlatCapSrc = new Float32Array(8);
const sWallFaceAtlas = { canvas: null, settings: null, capHeight: 0, bandHeight: 0, wallBaseZ: 0, edgeLen: 0, wallCx: 0, wallCy: 0 };
function wallFaceKindIndex(atlasFaceId) {
    switch (atlasFaceId) {
        case "inner":
            return 1;
        case "outer":
            return 2;
        case "end0":
            return 3;
        case "end1":
            return 4;
        default:
            return 0;
    }
}
function ensureWallDrawMemo(grid) {
    if (grid._wallDrawMemoWallRev !== grid.wallGridRevision || grid._wallDrawMemoSurfRev !== grid.surfaceMaterialRevision) {
        grid._wallAtlasMemo = new Map();
        grid._wallSubdivMemo = new Map();
        grid._wallDrawMemoWallRev = grid.wallGridRevision;
        grid._wallDrawMemoSurfRev = grid.surfaceMaterialRevision;
    }
}
function wallDrawMemoSlot(grid, face) {
    return ((face.gridRow * grid.cols + face.gridCol) * 4 + face.gridSide) * 5 + wallFaceKindIndex(face.atlasFaceId);
}
export function appendProjectedFaceBand(ctx, faceBottom, faceTop) {
    traceFlatQuad(ctx, faceBottom.proj1X, faceBottom.proj1Y, faceTop.proj1X, faceTop.proj1Y, faceTop.proj2X, faceTop.proj2Y, faceBottom.proj2X, faceBottom.proj2Y);
}
export function traceProjectedFaceBand(ctx, faceBottom, faceTop) {
    ctx.beginPath();
    appendProjectedFaceBand(ctx, faceBottom, faceTop);
}
export function projectWallFaceBandIntoScalars(x1, y1, x2, y2, z, viewport, out) {
    const alpha = resolveElevationAlpha(z, viewport);
    if (alpha <= 0) {
        out.proj1X = x1;
        out.proj1Y = y1;
        out.proj2X = x2;
        out.proj2Y = y2;
    } else {
        out.proj1X = x1 + (x1 - viewport.x) * alpha;
        out.proj1Y = y1 + (y1 - viewport.y) * alpha;
        out.proj2X = x2 + (x2 - viewport.x) * alpha;
        out.proj2Y = y2 + (y2 - viewport.y) * alpha;
    }
    return out;
}
function computeFaceCornerElevatedInto(out8, offset, u, v, faceBottom, faceTop) {
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
    out8[offset] = bx + (tx - bx) * v;
    out8[offset + 1] = by + (ty - by) * v;
}
function resolveWallFaceAtlasScalars(x1, y1, x2, y2, state, face) {
    const worldSurfaces = state.worldSurfaces;
    const { wallHeight, wallBaseZ, wallCapHeight, cacheObj, atlasFaceId } = face;
    const settings = worldSurfaces.settings;
    const profileId = resolveWallSurfaceProfileId(state.obstacleGrid, face, worldSurfaces.activeSurfaceProfileId, settings.cellsPerChunk);
    const seed = worldSurfaces.worldSurfaceSeed;
    const wallHeightKey = resolveWallCapHeightPx(wallCapHeight, settings);
    const canUseSideCache = cacheObj && worldSurfaces.cacheKeys && worldSurfaces.worldSurfaceSeed !== undefined;
    let stash = null;
    let memoSlot = -1;
    if (canUseSideCache) {
        ensureWallDrawMemo(state.obstacleGrid);
        memoSlot = wallDrawMemoSlot(state.obstacleGrid, face);
        stash = state.obstacleGrid._wallAtlasMemo.get(memoSlot);
    }
    let cacheHit = false;
    if (canUseSideCache && stash) {
        const atlasKey = worldSurfaces.cacheKeys.wallAtlasKeyScalars(x1, y1, x2, y2, seed, profileId, wallHeightKey);
        if (stash.profileId === profileId && stash.rev === atlasKey.rev && stash.seed === seed && stash.wallHeightKey === wallHeightKey && worldSurfaces.surfaceCache.get(stash.key) === stash.canvases)
            cacheHit = true;
    }
    if (cacheHit) {
        // cache hit!
    } else {
        stash = worldSurfaces.getOrEnsureWallAtlasScalars(x1, y1, x2, y2, {
            profileId,
            wallHeight: wallCapHeight,
            cacheObj: cacheObj && !cacheObj.isEdgeRail ? cacheObj : null,
            atlasFaceId: atlasFaceId ?? "side",
        });
        if (canUseSideCache && stash) state.obstacleGrid._wallAtlasMemo.set(memoSlot, stash);
    }
    if (!stash) return null;
    const canvas = stash.canvases[0];
    if (!canvas || canvas.isPlaceholder) return "solid";
    const atlas = sWallFaceAtlas;
    atlas.canvas = canvas;
    atlas.settings = settings;
    atlas.capHeight = wallCapHeight;
    atlas.bandHeight = wallHeight;
    atlas.wallBaseZ = wallBaseZ;
    atlas.edgeLen = Math.hypot(x2 - x1, y2 - y1);
    atlas.wallCx = (x1 + x2) * 0.5;
    atlas.wallCy = (y1 + y2) * 0.5;
    return atlas;
}
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
    const baseTransform = ctx.getTransform();
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
            computeFaceCornerElevatedInto(sSubdivQuad, 0, u0, v0, faceBottom, faceTop);
            computeFaceCornerElevatedInto(sSubdivQuad, 2, u1, v0, faceBottom, faceTop);
            computeFaceCornerElevatedInto(sSubdivQuad, 4, u1, v1, faceBottom, faceTop);
            computeFaceCornerElevatedInto(sSubdivQuad, 6, u0, v1, faceBottom, faceTop);
            if (!flatQuadOverlapAabb(sSubdivQuad[0], sSubdivQuad[1], sSubdivQuad[2], sSubdivQuad[3], sSubdivQuad[4], sSubdivQuad[5], sSubdivQuad[6], sSubdivQuad[7], worldBounds)) continue;
            drawImageQuadWithBaseTransformScalars(
                ctx,
                canvas,
                u0 * canvas.width,
                sy0,
                u1 * canvas.width,
                sy1,
                sSubdivQuad[0],
                sSubdivQuad[1],
                sSubdivQuad[2],
                sSubdivQuad[3],
                sSubdivQuad[4],
                sSubdivQuad[5],
                sSubdivQuad[6],
                sSubdivQuad[7],
                baseTransform.a,
                baseTransform.b,
                baseTransform.c,
                baseTransform.d,
                baseTransform.e,
                baseTransform.f,
            );
        }
    }
}
function resolveWallFaceSubdiv(face, atlas, viewport, grid) {
    const camKey = Math.round(viewport.cameraHeight);
    const perspKey = Math.round(viewport.perspectiveStrength * 100);
    ensureWallDrawMemo(grid);
    const memoSlot = wallDrawMemoSlot(grid, face);
    const cached = grid._wallSubdivMemo.get(memoSlot);
    if (cached && cached.camKey === camKey && cached.perspKey === perspKey) return cached.subdiv;
    const subdiv = computeWallFaceSubdiv(atlas.settings, atlas.bandHeight, atlas.capHeight, atlas.wallBaseZ, atlas.edgeLen, atlas.wallCx, atlas.wallCy, viewport);
    grid._wallSubdivMemo.set(memoSlot, { camKey, perspKey, subdiv });
    return subdiv;
}
function drawFaceTextureScalars(ctx, x1, y1, x2, y2, faceBottom, faceTop, viewport, state, face) {
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    const atlas = resolveWallFaceAtlasScalars(x1, y1, x2, y2, state, face);
    if (atlas === null) return;
    if (atlas === "solid") {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    const subdiv = resolveWallFaceSubdiv(face, atlas, viewport, state.obstacleGrid);
    if (!subdiv) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    blitWallFaceSubdiv(ctx, faceBottom, faceTop, atlas, subdiv, viewport, viewport.bounds("chunks"));
}
export function drawProjectedWallFaceScalars(ctx, x1, y1, x2, y2, viewport, state, face) {
    const { wallHeight, wallBaseZ } = face;
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    const topZ = wallBaseZ + wallHeight;
    const faceBottom = projectWallFaceBandIntoScalars(x1, y1, x2, y2, wallBaseZ, viewport, sFaceBottom);
    const faceTop = projectWallFaceBandIntoScalars(x1, y1, x2, y2, topZ, viewport, sharedScratchFace);
    traceProjectedFaceBand(ctx, faceBottom, faceTop);
    if (state.worldSurfaces) {
        ctx.save();
        ctx.clip();
        drawFaceTextureScalars(ctx, x1, y1, x2, y2, faceBottom, faceTop, viewport, state, face);
        ctx.restore();
    } else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
}
export function projectRailWallTopCornersIntoFlat(out8, data, base, viewport) {
    const z = data[base + RAIL_BOX.wallCapHeight];
    projectWorldQuadInto(
        out8,
        data[base + RAIL_BOX.outerP1x],
        data[base + RAIL_BOX.outerP1y],
        data[base + RAIL_BOX.outerP2x],
        data[base + RAIL_BOX.outerP2y],
        data[base + RAIL_BOX.innerP2x],
        data[base + RAIL_BOX.innerP2y],
        data[base + RAIL_BOX.innerP1x],
        data[base + RAIL_BOX.innerP1y],
        z,
        viewport,
    );
    return out8;
}
function fillProjectedCapPolygonFlat(ctx, corners8, fillStyle) {
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, corners8, 4);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}
function blitHorizontalCapSampleFlat(ctx, dest8, src8, canvas) {
    ctx.save();
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, dest8, 4);
    ctx.clip();
    const baseTransform = ctx.getTransform();
    drawImageTriangleWithBaseTransformScalars(
        ctx,
        canvas,
        src8[0],
        src8[1],
        src8[2],
        src8[3],
        src8[6],
        src8[7],
        dest8[0],
        dest8[1],
        dest8[2],
        dest8[3],
        dest8[6],
        dest8[7],
        baseTransform.a,
        baseTransform.b,
        baseTransform.c,
        baseTransform.d,
        baseTransform.e,
        baseTransform.f,
    );
    drawImageTriangleWithBaseTransformScalars(
        ctx,
        canvas,
        src8[2],
        src8[3],
        src8[4],
        src8[5],
        src8[6],
        src8[7],
        dest8[2],
        dest8[3],
        dest8[4],
        dest8[5],
        dest8[6],
        dest8[7],
        baseTransform.a,
        baseTransform.b,
        baseTransform.c,
        baseTransform.d,
        baseTransform.e,
        baseTransform.f,
    );
    ctx.restore();
}
export function drawProjectedRailWallCapFlat(ctx, data, base, viewport, state, face) {
    const worldSurfaces = state.worldSurfaces;
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    projectRailWallTopCornersIntoFlat(sFlatCapCorners, data, base, viewport);
    if (!worldSurfaces) {
        fillProjectedCapPolygonFlat(ctx, sFlatCapCorners, fillStyle);
        return;
    }
    flatRailWallCapUvCornersIntoFlat(sFlatCapUv, state.obstacleGrid, data, base);
    const wallCapHeight = data[base + RAIL_BOX.wallCapHeight];
    const capCanvas = worldSurfaces.fillHorizontalCapDrawSampleIntoFlat(sFlatCapUv, wallCapHeight, state, sFlatCapSrc);
    if (!capCanvas) {
        fillProjectedCapPolygonFlat(ctx, sFlatCapCorners, fillStyle);
        return;
    }
    blitHorizontalCapSampleFlat(ctx, sFlatCapCorners, sFlatCapSrc, capCanvas);
}
