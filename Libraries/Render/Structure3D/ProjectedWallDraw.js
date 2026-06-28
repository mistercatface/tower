/**
 * Projects wall faces via radial elevation projection and samples baked atlases from WorldSurfaceEngine.
 * Vertical bands: projectWorldPointInto. Horizontal caps: box top ring + per-corner chunk UV.
 */
import { drawImageQuadScalars, drawImageTriangleScalars } from "../../Canvas/AffineTexture.js";
import { resolveElevationAlpha, projectWorldPointInto, projectWorldQuadInto } from "../../Spatial/elevation/RadialElevationProjection.js";
import { railWallCapUvCornersInto, flatRailWallCapUvCornersInto, flatRailWallCapUvCornersIntoFlat, resolveWallCapHeightPx } from "../../World/wallGridBake.js";
import { pointsAabbOverlapAabb, flatQuadOverlapAabb } from "../../Math/Aabb2D.js";
import { traceQuad, traceClosedPolygon, traceClosedFlatPolygon, traceFlatQuad } from "../../Canvas/CanvasPath.js";
import { gameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { resolveWallSurfaceProfileId } from "../../Spatial/grid/SurfaceMaterialStore.js";
const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sFaceBottom = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sBandPoint0 = { x: 0, y: 0 };
const sBandPoint1 = { x: 0, y: 0 };
const sSubdivQuad = new Float32Array(8);
const sFlatCapCorners = new Float32Array(8);
const sFlatCapUv = new Float32Array(8);
const sFlatCapSrc = new Float32Array(8);
const sCapCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
const sWallFaceAtlas = { canvas: null, settings: null, capHeight: 0, bandHeight: 0, wallBaseZ: 0, edgeLen: 0, wallCx: 0, wallCy: 0 };

function getRailMemo(grid, key) {
    if (!grid._railMemoCache || grid._railMemoRevision !== grid.wallGridRevision) {
        grid._railMemoCache = new Map();
        grid._railMemoRevision = grid.wallGridRevision;
    }
    return grid._railMemoCache.get(key);
}

function setRailMemo(grid, key, value) {
    if (!grid._railMemoCache || grid._railMemoRevision !== grid.wallGridRevision) {
        grid._railMemoCache = new Map();
        grid._railMemoRevision = grid.wallGridRevision;
    }
    grid._railMemoCache.set(key, value);
}

function getRailSubdivMemo(grid, drawable, faceId) {
    const key = `subdiv|${drawable.gridCol},${drawable.gridRow},${drawable.gridSide}|${faceId}`;
    return getRailMemo(grid, key);
}

function setRailSubdivMemo(grid, drawable, faceId, subdivKey, subdiv) {
    const key = `subdiv|${drawable.gridCol},${drawable.gridRow},${drawable.gridSide}|${faceId}`;
    setRailMemo(grid, key, { subdivKey, subdiv });
}

export function appendProjectedFaceBand(ctx, faceBottom, faceTop) {
    traceFlatQuad(ctx, faceBottom.proj1X, faceBottom.proj1Y, faceTop.proj1X, faceTop.proj1Y, faceTop.proj2X, faceTop.proj2Y, faceBottom.proj2X, faceBottom.proj2Y);
}
export function traceProjectedFaceBand(ctx, faceBottom, faceTop) {
    ctx.beginPath();
    appendProjectedFaceBand(ctx, faceBottom, faceTop);
}
export function projectWallFaceBandInto(p1, p2, z, viewport, out) {
    projectWorldPointInto(sBandPoint0, p1.x, p1.y, z, viewport);
    projectWorldPointInto(sBandPoint1, p2.x, p2.y, z, viewport);
    out.proj1X = sBandPoint0.x;
    out.proj1Y = sBandPoint0.y;
    out.proj2X = sBandPoint1.x;
    out.proj2Y = sBandPoint1.y;
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
function resolveWallFaceAtlas(p1, p2, state, face) {
    const worldSurfaces = state.worldSurfaces;
    const { wallHeight, wallBaseZ, wallCapHeight, cacheObj, atlasFaceId } = face;
    const settings = worldSurfaces.settings;
    const wallCx = (p1.x + p2.x) * 0.5;
    const wallCy = (p1.y + p2.y) * 0.5;
    const profileId = resolveWallSurfaceProfileId(state.obstacleGrid, face, worldSurfaces.activeSurfaceProfileId, settings.cellsPerChunk);

    const seed = worldSurfaces.worldSurfaceSeed;
    const wallHeightKey = resolveWallCapHeightPx(wallCapHeight, settings);
    const canUseSideCache = cacheObj && cacheObj.isEdgeRail && worldSurfaces.cacheKeys && worldSurfaces.worldSurfaceSeed !== undefined;

    let stash = null;
    let memoKey = null;
    if (canUseSideCache) {
        memoKey = `atlas|${cacheObj.gridCol},${cacheObj.gridRow},${cacheObj.gridSide}|${atlasFaceId ?? "side"}`;
        stash = getRailMemo(state.obstacleGrid, memoKey);
    }

    let cacheHit = false;
    if (canUseSideCache && stash) {
        const atlasKey = worldSurfaces.cacheKeys.wallAtlasKey(p1, p2, seed, profileId, wallHeightKey);
        if (
            stash.profileId === profileId &&
            stash.rev === atlasKey.rev &&
            stash.seed === seed &&
            stash.wallHeightKey === wallHeightKey &&
            worldSurfaces.surfaceCache.get(stash.key) === stash.canvases
        ) {
            cacheHit = true;
        }
    }

    if (cacheHit) {
        // cache hit!
    } else {
        stash = worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, wallHeight: wallCapHeight, cacheObj: (cacheObj && !cacheObj.isEdgeRail) ? cacheObj : null, atlasFaceId: atlasFaceId ?? "side" });
        if (canUseSideCache && stash) {
            setRailMemo(state.obstacleGrid, memoKey, stash);
        }
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
    atlas.edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    atlas.wallCx = wallCx;
    atlas.wallCy = wallCy;
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
            drawImageQuadScalars(ctx, canvas, u0 * canvas.width, sy0, u1 * canvas.width, sy1, sSubdivQuad[0], sSubdivQuad[1], sSubdivQuad[2], sSubdivQuad[3], sSubdivQuad[4], sSubdivQuad[5], sSubdivQuad[6], sSubdivQuad[7]);
        }
    }
}
function resolveWallFaceSubdiv(face, atlas, viewport, grid) {
    const cacheObj = face.cacheObj;
    const faceId = face.atlasFaceId ?? "side";
    const subdivKey = `${faceId}|${atlas.edgeLen}|${viewport.x}|${viewport.y}|${atlas.wallBaseZ}|${atlas.bandHeight}`;
    if (cacheObj && cacheObj.isEdgeRail) {
        const memo = getRailSubdivMemo(grid, cacheObj, faceId);
        if (memo && memo.subdivKey === subdivKey) return memo.subdiv;
    } else if (cacheObj && cacheObj._faceSubdivKey === subdivKey) {
        return cacheObj._faceSubdiv;
    }
    const subdiv = computeWallFaceSubdiv(atlas.settings, atlas.bandHeight, atlas.capHeight, atlas.wallBaseZ, atlas.edgeLen, atlas.wallCx, atlas.wallCy, viewport);
    if (cacheObj) {
        if (cacheObj.isEdgeRail) {
            setRailSubdivMemo(grid, cacheObj, faceId, subdivKey, subdiv);
        } else {
            cacheObj._faceSubdivKey = subdivKey;
            cacheObj._faceSubdiv = subdiv;
        }
    }
    return subdiv;
}
function drawFaceTexture(ctx, p1, p2, faceBottom, faceTop, viewport, state, face) {
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    const atlas = resolveWallFaceAtlas(p1, p2, state, face);
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
export function projectRailWallTopCornersInto(out4, box, viewport) {
    const z = box.wallCapHeight;
    projectWorldPointInto(out4[0], box.outerP1x, box.outerP1y, z, viewport);
    projectWorldPointInto(out4[1], box.outerP2x, box.outerP2y, z, viewport);
    projectWorldPointInto(out4[2], box.innerP2x, box.innerP2y, z, viewport);
    projectWorldPointInto(out4[3], box.innerP1x, box.innerP1y, z, viewport);
    return out4;
}
export function projectRailWallTopCornersIntoFlat(out8, data, base, viewport) {
    const z = data[base + RAIL_BOX.wallCapHeight];
    projectWorldQuadInto(out8, data[base + RAIL_BOX.outerP1x], data[base + RAIL_BOX.outerP1y], data[base + RAIL_BOX.outerP2x], data[base + RAIL_BOX.outerP2y], data[base + RAIL_BOX.innerP2x], data[base + RAIL_BOX.innerP2y], data[base + RAIL_BOX.innerP1x], data[base + RAIL_BOX.innerP1y], z, viewport);
    return out8;
}
function fillProjectedCapPolygon(ctx, corners, fillStyle) {
    ctx.beginPath();
    traceClosedPolygon(ctx, corners);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}
function fillProjectedCapPolygonFlat(ctx, corners8, fillStyle) {
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, corners8, 4);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}
function blitHorizontalCapSample(ctx, dest4, src4, canvas) {
    ctx.save();
    ctx.beginPath();
    traceClosedPolygon(ctx, dest4);
    ctx.clip();
    drawImageTriangleScalars(ctx, canvas, src4[0].x, src4[0].y, src4[1].x, src4[1].y, src4[3].x, src4[3].y, dest4[0].x, dest4[0].y, dest4[1].x, dest4[1].y, dest4[3].x, dest4[3].y);
    drawImageTriangleScalars(ctx, canvas, src4[1].x, src4[1].y, src4[2].x, src4[2].y, src4[3].x, src4[3].y, dest4[1].x, dest4[1].y, dest4[2].x, dest4[2].y, dest4[3].x, dest4[3].y);
    ctx.restore();
}
function blitHorizontalCapSampleFlat(ctx, dest8, src8, canvas) {
    ctx.save();
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, dest8, 4);
    ctx.clip();
    drawImageTriangleScalars(ctx, canvas, src8[0], src8[1], src8[2], src8[3], src8[6], src8[7], dest8[0], dest8[1], dest8[2], dest8[3], dest8[6], dest8[7]);
    drawImageTriangleScalars(ctx, canvas, src8[2], src8[3], src8[4], src8[5], src8[6], src8[7], dest8[2], dest8[3], dest8[4], dest8[5], dest8[6], dest8[7]);
    ctx.restore();
}
export function drawProjectedRailWallCap(ctx, box, viewport, state, face) {
    const worldSurfaces = state.worldSurfaces;
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    projectRailWallTopCornersInto(sCapCorners, box, viewport);
    if (!worldSurfaces) {
        fillProjectedCapPolygon(ctx, sCapCorners, fillStyle);
        return;
    }
    railWallCapUvCornersInto(sCapUv, state.obstacleGrid, box);
    const capCanvas = worldSurfaces.fillHorizontalCapDrawSampleInto(sCapUv, box.wallCapHeight, state, sCapSrc);
    if (!capCanvas) {
        fillProjectedCapPolygon(ctx, sCapCorners, fillStyle);
        return;
    }
    blitHorizontalCapSample(ctx, sCapCorners, sCapSrc, capCanvas);
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
export function drawProjectedWallFace(ctx, p1, p2, viewport, state, face) {
    const { wallHeight, wallBaseZ } = face;
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    const topZ = wallBaseZ + wallHeight;
    const faceBottom = projectWallFaceBandInto(p1, p2, wallBaseZ, viewport, sFaceBottom);
    const faceTop = projectWallFaceBandInto(p1, p2, topZ, viewport, sharedScratchFace);
    traceProjectedFaceBand(ctx, faceBottom, faceTop);
    if (state.worldSurfaces) {
        ctx.save();
        ctx.clip();
        drawFaceTexture(ctx, p1, p2, faceBottom, faceTop, viewport, state, face);
        ctx.restore();
    } else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
}
