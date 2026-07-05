import {
    traceAabbRect,
    fillCircle,
    strokeSegment,
    traceSegment,
    fillClosedPolygon,
    fillStrokeCircle,
    strokeCircle,
    strokeOpenPolyline,
    traceClosedFlatPolygon,
    traceFlatQuad,
    fillRgbaBuffer,
    fillRgbaRect,
    strokeAxisLineRgba,
    createOffscreenCanvas,
    resizeOffscreenCanvas,
    OVERLAY_RENDER_KEY,
    drawCachedOverlayGlyph,
    drawCachedPropSprite,
    drawCachedGridStampFilmstripShared,
    warmSharedGridStampFilmstripCache,
    drawImageQuadFromFlatRingsWithBaseTransform,
    drawImageTriangleFlatWithBaseTransform,
    drawImageQuadWithBaseTransformScalars,
    drawImageTriangleWithBaseTransformScalars,
    drawImageQuadScalars,
    SpriteCache,
    GRID_STAMP_RENDER_KEY,
    BELT_FILMSTRIP_FRAMES,
    BELT_FRAME_MS,
    blitMaskOverlay,
    addMaskPathFill,
    cutOutRadialSoftDisc,
    fillMaskBase,
    traceWoundFlatQuad,
} from "../Canvas/canvas.js";
import {
    isRailWallEdge,
    forEachCellEdge,
    gridNavCacheKey,
    resolveElevationAlpha,
    extrudeLocalVertsInto,
    pointOnFrustumInto,
    getHeightSlice,
    traceVisibleArc,
    isFaceTowardViewer,
    isOutwardFaceTowardViewer,
    createSideGradientAt,
    projectVertical,
    projectWorldPointInto,
    projectWorldQuadInto,
    resolveWallSurfaceProfileId,
    cellInRect,
    BeltPacked,
    floorOccupancyStampDrawCacheKey,
    projectWallShadowQuadScreenInto,
    collectExposedWallEdgesInAabb,
} from "../Spatial/spatial.js";
import {
    quantizeAngleIndex,
    normalizeXY,
    lengthXY,
    rotateXY,
    flatQuadOverlapAabb,
    transformPoint2DInto,
    centeredAabbInto,
    createAabb,
    aabbFromTwoPointsInto,
    distanceSqToAabb,
    centerReachAabbInto,
    radiusAtT,
    scaleAtHeight,
} from "../Math/math.js";
import { transformRollVertex, resolveBodyRadius, IDENTITY_ROLL_QUAT, getEntityCollisionParts, distanceBetweenAnchors, worldAnchorFromBody, listKineticConstraints } from "../Physics/physics.js";
import { resolveVisualOverrideColorTree } from "../Color/visualOverride.js";
import {
    collectVoxelWallFacesInAabbFlat,
    VOXEL_FACE,
    VOXEL_FACE_STRIDE,
    collectRailWallBoxesInAabb,
    RAIL_BOX,
    RAIL_BOX_STRIDE,
    flatRailWallCapUvCornersIntoFlat,
    resolveWallCapHeightPx,
} from "../World/wallGridBake.js";
import { StrideFloatList } from "../World/StrideFloatList.js";
import { gameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { RenderSprites } from "../../Render/RenderSprites.js";
import propCatalog from "../../Assets/props/index.js";
import { getSurfaceProfileRevision } from "../WorldSurface/worldSurface.js";
// --- Consolidated Global Scratch Arrays (GC & Memory Optimization) ---
const sScratchQuad1 = new Float32Array(8);
const sScratchQuad2 = new Float32Array(8);
const sScratchQuad3 = new Float32Array(8);
const sScratchQuad4 = new Float32Array(8);
const sScratchQuad5 = new Float32Array(8);
const sScratchQuad6 = new Float32Array(8);
const sScratchQuad7 = new Float32Array(8);
let sFlatProjectedVerts = sScratchQuad1;
const sPinwheelLocalVerts = new Float32Array(24);
const sBandQuad = sScratchQuad2;
const sBoxFootprint = sScratchQuad3;
const sSubdivQuad = sScratchQuad4;
const sFlatCapCorners = sScratchQuad5;
const sFlatCapUv = sScratchQuad6;
const sFlatCapSrc = sScratchQuad7;
const sScratchQuad = sScratchQuad1; // Safe to reuse sScratchQuad1 since no overlap
const sScratchChevron = new Float32Array(12);
const sTemp = new Float32Array(2);
/**
 * Draw options for WorldSceneRenderer entry points.
 */
/**
 * @typedef {Object} WorldSceneDrawOptions
 * @property {boolean} [textureEnabled]
 * @property {boolean} [skipWalls]
 * @property {boolean} [skipWallCaps]
 */
export {};
/**
 * Inverse of the current canvas horizontal scale — multiply line widths, dash lengths,
 * and marker radii so they stay constant in screen pixels after `viewport.apply(ctx)`.
 *
 * @param {CanvasRenderingContext2D} ctx
 */
export function getCanvasLineScale(ctx) {
    return 1 / Math.max(0.001, ctx.getTransform().a);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Math/Aabb2D.js").Aabb2D} aabb
 * @param {{ fill?: string, stroke?: string, lineWidth?: number, dash?: number[] }} [style]
 */
export function drawAabbHighlight(ctx, aabb, { fill, stroke, lineWidth = 1, dash } = {}) {
    const lineScale = getCanvasLineScale(ctx);
    const { minX, minY, maxX, maxY } = aabb;
    ctx.save();
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth * lineScale;
        if (dash?.length) ctx.setLineDash(dash.map((segment) => segment * lineScale));
        ctx.beginPath();
        traceAabbRect(ctx, aabb);
        ctx.stroke();
        if (dash?.length) ctx.setLineDash([]);
    }
    ctx.restore();
}
/** Pixels per grid cell in the map overview bake — edges draw on boundaries, not as cell fills. */
const OVERVIEW_PIXELS_PER_CELL = 4;
const OVERVIEW_FLOOR_RGB = [12, 14, 18];
const OVERVIEW_WALL_RGB = [72, 78, 88];
const OVERVIEW_RAIL_RGB = [224, 64, 251];
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D & { canvas: OffscreenCanvas }} MapImageCache */
/** @typedef {MapImageCache} ObstacleOverviewCache */
function bakeCanvas(width, height) {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return createOffscreenCanvas(w, h);
}
function bakePathDebugLayer(debugView, minX, minY, maxX, maxY) {
    const canvas = bakeCanvas(maxX - minX, maxY - minY);
    if (!canvas || !debugView.grid) return null;
    const ctx = canvas.getContext("2d");
    ctx.translate(-minX, -minY);
    const endCol = debugView.cols - 1;
    const endRow = debugView.rows - 1;
    const cellToRegion = debugView.cellToRegion;
    for (let row = 0; row <= endRow; row++)
        for (let col = 0; col <= endCol; col++) {
            const isBlocked = debugView.grid[row * debugView.cols + col] !== 0;
            const wx = debugView.minX + col * debugView.cellSize;
            const wy = debugView.minY + row * debugView.cellSize;
            if (isBlocked) {
                ctx.fillStyle = "rgba(244, 67, 54, 0.25)";
                ctx.fillRect(wx, wy, debugView.cellSize, debugView.cellSize);
            } else if (!cellToRegion || cellToRegion[row * debugView.cols + col] < 0) {
                ctx.fillStyle = "rgba(76, 175, 80, 0.05)";
                ctx.fillRect(wx, wy, debugView.cellSize, debugView.cellSize);
            }
        }
    if (cellToRegion) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
        ctx.lineWidth = 1.5;
        for (let row = 0; row <= endRow; row++)
            for (let col = 0; col <= endCol; col++) {
                const idx = row * debugView.cols + col;
                if (debugView.grid[idx]) continue;
                const region = cellToRegion[idx];
                if (region < 0) continue;
                const wx = debugView.minX + col * debugView.cellSize;
                const wy = debugView.minY + row * debugView.cellSize;
                const cellSize = debugView.cellSize;
                if (col + 1 < debugView.cols) {
                    const rIdx = idx + 1;
                    if (debugView.grid[rIdx] === 0) {
                        const rightRegion = cellToRegion[rIdx];
                        if (rightRegion >= 0 && rightRegion !== region && debugView.regionCanStep(idx, rIdx)) traceSegment(ctx, wx + cellSize, wy, wx + cellSize, wy + cellSize);
                    }
                }
                if (row + 1 < debugView.rows) {
                    const bIdx = idx + debugView.cols;
                    if (debugView.grid[bIdx] === 0) {
                        const bottomRegion = cellToRegion[bIdx];
                        if (bottomRegion >= 0 && bottomRegion !== region && debugView.regionCanStep(idx, bIdx)) traceSegment(ctx, wx, wy + cellSize, wx + cellSize, wy + cellSize);
                    }
                }
            }
        ctx.stroke();
    }
    const { nodeIdx, nodeCount } = debugView;
    for (let i = 0; i < nodeCount; i++) {
        const idx = nodeIdx[i];
        const wx = debugView.gridCenterXByIdx(idx);
        const wy = debugView.gridCenterYByIdx(idx);
        ctx.fillStyle = "#00e5ff";
        fillCircle(ctx, wx, wy, 4);
    }
    for (const edge of debugView.edges) {
        const idxA = nodeIdx[edge.sourceIdx];
        const idxB = nodeIdx[edge.targetIdx];
        const ax = debugView.gridCenterXByIdx(idxA);
        const ay = debugView.gridCenterYByIdx(idxA);
        const bx = debugView.gridCenterXByIdx(idxB);
        const by = debugView.gridCenterYByIdx(idxB);
        ctx.strokeStyle = "#ff9800";
        ctx.lineWidth = 2.5;
        strokeSegment(ctx, ax, ay, bx, by);
    }
    return { canvas, minX, minY, maxX, maxY };
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {OffscreenCanvas | null | undefined} [reuseCanvas] */
export function bakeObstacleOverviewCache(obstacleGrid, reuseCanvas = null) {
    const ppc = OVERVIEW_PIXELS_PER_CELL;
    const { cols, rows } = obstacleGrid;
    const w = cols * ppc;
    const h = rows * ppc;
    const canvas = reuseCanvas ?? createOffscreenCanvas(w, h);
    resizeOffscreenCanvas(canvas, w, h);
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(w, h);
    const px = data.data;
    fillRgbaBuffer(px, OVERVIEW_FLOOR_RGB);
    for (let i = 0; i < obstacleGrid.grid.length; i++) {
        if (obstacleGrid.grid[i] === 0) continue;
        const col = i % cols;
        const row = (i / cols) | 0;
        fillRgbaRect(px, w, h, col * ppc, row * ppc, ppc, ppc, OVERVIEW_WALL_RGB);
    }
    forEachCellEdge(
        obstacleGrid,
        (idx, side) => {
            const col = idx % cols;
            const row = (idx / cols) | 0;
            if (side === 0) strokeAxisLineRgba(px, w, h, col * ppc, row * ppc, (col + 1) * ppc - 1, row * ppc, OVERVIEW_RAIL_RGB);
            else if (side === 1) strokeAxisLineRgba(px, w, h, (col + 1) * ppc - 1, row * ppc, (col + 1) * ppc - 1, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
            else if (side === 2) strokeAxisLineRgba(px, w, h, col * ppc, (row + 1) * ppc - 1, (col + 1) * ppc - 1, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
            else strokeAxisLineRgba(px, w, h, col * ppc, row * ppc, col * ppc, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
        },
        { canonicalOnly: true, filter: isRailWallEdge },
    );
    ctx.putImageData(data, 0, 0);
    return { canvas, minX: obstacleGrid.minX, minY: obstacleGrid.minY, maxX: obstacleGrid.maxX, maxY: obstacleGrid.maxY };
}
/** @param {object} state */
export function labPathDebugCacheKey(state) {
    const grid = state.obstacleGrid;
    return `${gridNavCacheKey(grid)}:${state.nav.graphSyncGeneration}:${grid.cols}x${grid.rows}`;
}
/** @param {object} state */
export async function ensureLabPathDebugCache(state) {
    const key = labPathDebugCacheKey(state);
    if (state._labPathDebugKey === key && state.mapPathDebugCache) return state.mapPathDebugCache;
    if (state._labPathDebugBake) return state._labPathDebugBake;
    state._labPathDebugBake = (async () => {
        const grid = state.obstacleGrid;
        await state.nav.awaitWorkerNavReady();
        const debugView = state.nav.worker.getRegionGraphDebugView(grid);
        state.mapPathDebugCache = debugView ? bakePathDebugLayer(debugView, grid.minX, grid.minY, grid.maxX, grid.maxY) : null;
        state._labPathDebugKey = key;
        state._labPathDebugBake = null;
        return state.mapPathDebugCache;
    })();
    return state._labPathDebugBake;
}
export function drawLabPathDebugOverlay(ctx, viewport, state, onCacheReady) {
    if (state._labPathDebugKey !== labPathDebugCacheKey(state) && !state._labPathDebugRedrawScheduled) {
        state._labPathDebugRedrawScheduled = true;
        void ensureLabPathDebugCache(state).then(() => {
            state._labPathDebugRedrawScheduled = false;
            onCacheReady?.();
        });
    }
    const pathCache = state.mapPathDebugCache;
    if (!pathCache) return;
    ctx.save();
    viewport.apply(ctx);
    ctx.drawImage(pathCache.canvas, pathCache.minX, pathCache.minY);
    ctx.restore();
}
/** @param {object} state */
export function rebuildLabMapOverviewCache(state) {
    const grid = state.obstacleGrid;
    state.mapOverviewCache = bakeObstacleOverviewCache(grid, state.mapOverviewCache?.canvas);
    state.editor?.repaintMapOverview?.();
}
/** @param {object} state */
export function rebuildLabMapCaches(state) {
    rebuildLabMapOverviewCache(state);
}
const OVERLAY_RADIUS_STEP = 0.5;
const OVERLAY_DIR_STEPS = 16;
export function quantizeOverlayRadius(r) {
    return Math.max(OVERLAY_RADIUS_STEP, Math.round(r / OVERLAY_RADIUS_STEP) * OVERLAY_RADIUS_STEP);
}
export function quantizeOverlayDirKey(dirX, dirY, steps = OVERLAY_DIR_STEPS) {
    if (dirX == null || dirY == null) return "d0";
    return `d${quantizeAngleIndex(Math.atan2(dirY, dirX), steps)}`;
}
export function selectionRingCacheKey(r) {
    return `r${quantizeOverlayRadius(r)}`;
}
export function pathDestinationCacheKey(r, fill) {
    return `r${quantizeOverlayRadius(r)}_${fill}`;
}
export function pathArrowHeadCacheKey(dirX, dirY, fill, headLen = 9, headWidth = 6) {
    return `${quantizeOverlayDirKey(dirX, dirY)}_${fill}_hl${headLen}_hw${headWidth}`;
}
export function flowDirectionArrowCacheKey(dirX, dirY, pad, len, stroke, headLen = 9, headWidth = 6) {
    return `${quantizeOverlayDirKey(dirX, dirY)}_p${Math.round(pad)}_l${len}_${stroke}_hl${headLen}_hw${headWidth}`;
}
export function wireEndpointCacheKey(r, fill) {
    return `r${quantizeOverlayRadius(r)}_${fill}`;
}
export function gridCellHighlightCacheKey(grid, tint) {
    return `cs${grid.cellSize}_${tint}`;
}
/** @typedef {{ renderKey: string, customKey: string, worldSpan: number, anchorX?: number, anchorY?: number }} OverlayCacheMeta */
/** @typedef {{ kind: 'aabb', minX: number, minY: number, maxX: number, maxY: number, fill?: string, stroke?: string, lineWidth?: number, dash?: number[], cache?: OverlayCacheMeta }} OverlayAabbCommand */
/** @typedef {{ kind: 'circleStroke', cx: number, cy: number, r: number, stroke: string, lineWidth?: number, dash?: number[], cache?: OverlayCacheMeta }} OverlayCircleStrokeCommand */
/** @typedef {{ kind: 'circleFillStroke', cx: number, cy: number, r: number, fill: string, stroke?: string, lineWidth?: number, cache?: OverlayCacheMeta }} OverlayCircleFillStrokeCommand */
/** @typedef {{ kind: 'segment', x0: number, y0: number, x1: number, y1: number, stroke: string, lineWidth?: number, dash?: number[], lineCap?: CanvasLineCap }} OverlaySegmentCommand */
/** @typedef {{ kind: 'polyline', points: { x: number, y: number }[], stroke: string, lineWidth?: number, dash?: number[] }} OverlayPolylineCommand */
/** @typedef {{ kind: 'arrowHead', x: number, y: number, dirX: number, dirY: number, fill: string, headLen?: number, headWidth?: number, cache?: OverlayCacheMeta }} OverlayArrowHeadCommand */
/** @typedef {{ kind: 'directionArrow', cx: number, cy: number, dirX: number, dirY: number, pad: number, len: number, stroke: string, lineWidth?: number, headLen?: number, headWidth?: number, cache?: OverlayCacheMeta }} OverlayDirectionArrowCommand */
/** @typedef {{ kind: 'aimSegment', x1: number, y1: number, x2: number, y2: number, color: string, lineWidth?: number, arrowhead?: boolean, glow?: boolean, glowHue?: number }} OverlayAimSegmentCommand */
/** @typedef {OverlayAabbCommand | OverlayCircleStrokeCommand | OverlayCircleFillStrokeCommand | OverlaySegmentCommand | OverlayPolylineCommand | OverlayArrowHeadCommand | OverlayDirectionArrowCommand | OverlayAimSegmentCommand} OverlayCommand */
function overlayCacheMeta(renderKey, customKey, worldSpan, anchorX, anchorY) {
    return { renderKey, customKey, worldSpan, anchorX, anchorY };
}
function overlayGlyphSpan(r, lineWidth = 1, extra = 0) {
    return r * 2 + lineWidth + extra;
}
export function overlayAabb(aabb, { fill, stroke, lineWidth = 1, dash } = {}) {
    return { kind: "aabb", minX: aabb.minX, minY: aabb.minY, maxX: aabb.maxX, maxY: aabb.maxY, fill, stroke, lineWidth, dash };
}
export function overlayGridCellHighlight(aabb, grid, tint, style) {
    const w = aabb.maxX - aabb.minX;
    const h = aabb.maxY - aabb.minY;
    const anchorX = (aabb.minX + aabb.maxX) * 0.5;
    const anchorY = (aabb.minY + aabb.maxY) * 0.5;
    const cmd = overlayAabb(aabb, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.GridCellHighlight, gridCellHighlightCacheKey(grid, tint), Math.max(w, h), anchorX, anchorY);
    return cmd;
}
export function overlayCircleStroke(cx, cy, r, { stroke, lineWidth = 1, dash }) {
    return { kind: "circleStroke", cx, cy, r, stroke, lineWidth, dash };
}
export function overlayCachedSelectionRing(cx, cy, r, style) {
    const cmd = overlayCircleStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.SelectionRing, selectionRingCacheKey(r), overlayGlyphSpan(r, style.lineWidth ?? 1, 4), cx, cy);
    return cmd;
}
export function overlayCircleFillStroke(cx, cy, r, { fill, stroke = "#fff", lineWidth = 1 }) {
    return { kind: "circleFillStroke", cx, cy, r, fill, stroke, lineWidth };
}
export function overlayCachedCircleFillStroke(cx, cy, r, style, renderKey, customKey, lineWidthForSpan = style.lineWidth ?? 1) {
    const cmd = overlayCircleFillStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(renderKey, customKey, overlayGlyphSpan(r, lineWidthForSpan), cx, cy);
    return cmd;
}
export function overlaySegment(x0, y0, x1, y1, { stroke, lineWidth = 1, dash, lineCap }) {
    return { kind: "segment", x0, y0, x1, y1, stroke, lineWidth, dash, lineCap };
}
export function overlayPolyline(points, { stroke, lineWidth = 1, dash }) {
    return { kind: "polyline", points, stroke, lineWidth, dash };
}
export function overlayArrowHead(x, y, dirX, dirY, { fill, headLen = 9, headWidth = 6 }) {
    return { kind: "arrowHead", x, y, dirX, dirY, fill, headLen, headWidth };
}
export function overlayCachedArrowHead(x, y, dirX, dirY, { fill, headLen = 9, headWidth = 6 }) {
    const cmd = overlayArrowHead(x, y, dirX, dirY, { fill, headLen, headWidth });
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.PathArrowHead, pathArrowHeadCacheKey(dirX, dirY, fill, headLen, headWidth), overlayGlyphSpan(Math.max(headLen, headWidth), 1, 2), x, y);
    return cmd;
}
export function overlayCachedFlowDirectionArrow(cx, cy, dirX, dirY, { pad = 0, len = 20, stroke, lineWidth = 2, headLen = 9, headWidth = 6 }) {
    const cmd = { kind: "directionArrow", cx, cy, dirX, dirY, pad, len, stroke, lineWidth, headLen, headWidth };
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.FlowDirectionArrow, flowDirectionArrowCacheKey(dirX, dirY, pad, len, stroke, headLen, headWidth), pad + len + headLen + lineWidth + 4, cx, cy);
    return cmd;
}
export function appendOverlayWireLink(out, x0, y0, x1, y1, color, { lineWidth = 2, dash = [6, 4], endpointRadius = 3, live = false } = {}) {
    out.push(overlaySegment(x0, y0, x1, y1, { stroke: color, lineWidth, dash }));
    if (live) out.push(overlayCircleFillStroke(x1, y1, endpointRadius, { fill: color, stroke: color, lineWidth: 1 }));
    else out.push(overlayCachedCircleFillStroke(x1, y1, endpointRadius, { fill: color, stroke: color, lineWidth: 1 }, OVERLAY_RENDER_KEY.WireEndpoint, wireEndpointCacheKey(endpointRadius, color), 1));
}
export function overlayAimSegment(x1, y1, x2, y2, { color, lineWidth = 3, arrowhead = true, glow = true, glowHue = 180 } = {}) {
    return { kind: "aimSegment", x1, y1, x2, y2, color, lineWidth, arrowhead, glow, glowHue };
}
function drawArrowHeadAt(ctx, tipX, tipY, dirX, dirY, fill, headLen, headWidth) {
    const tx = -dirY;
    const ty = dirX;
    const baseCenterX = tipX - dirX * headLen;
    const baseCenterY = tipY - dirY * headLen;
    ctx.fillStyle = fill;
    fillClosedPolygon(ctx, [
        { x: tipX, y: tipY },
        { x: baseCenterX + tx * headWidth, y: baseCenterY + ty * headWidth },
        { x: baseCenterX - tx * headWidth, y: baseCenterY - ty * headWidth },
    ]);
}
function drawAabbStyle(ctx, rect, { fill, stroke, lineWidth = 1, dash }) {
    const w = rect.maxX - rect.minX;
    const h = rect.maxY - rect.minY;
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(rect.minX, rect.minY, w, h);
    }
    if (!stroke) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    if (dash?.length) ctx.setLineDash(dash);
    ctx.beginPath();
    traceAabbRect(ctx, rect);
    ctx.stroke();
    if (dash?.length) ctx.setLineDash([]);
}
export function bakeOverlayCommand(ctx, anchorX, anchorY, cmd) {
    if (cmd.kind === "circleStroke") {
        ctx.strokeStyle = cmd.stroke;
        ctx.lineWidth = cmd.lineWidth ?? 1;
        if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
        strokeCircle(ctx, anchorX, anchorY, cmd.r);
        if (cmd.dash?.length) ctx.setLineDash([]);
        return;
    }
    if (cmd.kind === "circleFillStroke") {
        ctx.fillStyle = cmd.fill;
        ctx.strokeStyle = cmd.stroke ?? "#fff";
        ctx.lineWidth = cmd.lineWidth ?? 1;
        fillStrokeCircle(ctx, anchorX, anchorY, cmd.r);
        return;
    }
    if (cmd.kind === "arrowHead") {
        drawArrowHeadAt(ctx, anchorX, anchorY, cmd.dirX, cmd.dirY, cmd.fill, cmd.headLen ?? 9, cmd.headWidth ?? 6);
        return;
    }
    if (cmd.kind === "directionArrow") {
        const { dirX, dirY, pad, len, stroke, lineWidth = 2, headLen = 9, headWidth = 6 } = cmd;
        const startX = anchorX + dirX * pad;
        const startY = anchorY + dirY * pad;
        const tipX = startX + dirX * len;
        const tipY = startY + dirY * len;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        strokeSegment(ctx, startX, startY, tipX, tipY);
        drawArrowHeadAt(ctx, tipX, tipY, dirX, dirY, stroke, headLen, headWidth);
        return;
    }
    if (cmd.kind === "aabb") {
        const w = cmd.maxX - cmd.minX;
        const h = cmd.maxY - cmd.minY;
        const minX = anchorX - w * 0.5;
        const minY = anchorY - h * 0.5;
        drawAabbStyle(ctx, { minX, minY, maxX: minX + w, maxY: minY + h }, cmd);
    }
}
/** @typedef {"normal" | "debug"} PathOverlayVisual */
/** @typedef {Object} PathOverlayData
 * @property {"direct" | "hpa" | "flow"} mode
 * @property {number} [propX]
 * @property {number} [propY]
 * @property {number} [propRadius]
 * @property {number} [dirX]
 * @property {number} [dirY]
 * @property {number} [targetX]
 * @property {number} [targetY]
 * @property {Array<{ x: number, y: number }>} [pathNodes]
 * @property {Array<{ x: number, y: number, id?: string }>} [abstractPath]
 * @property {"local" | "hpa"} [pathPlanner]
 */
const FLOW_ARROW_LEN = 20;
const FLOW_ARROW_PAD = 5;
const PATH_STROKE_WIDTH = 2;
const HPA_STROKE_WIDTH = 2.5;
function appendPathEndArrow(out, pathNodes, targetX, targetY, color) {
    if (targetX != null && targetY != null && pathNodes.length >= 1) {
        const from = pathNodes[pathNodes.length - 1];
        const { nx, ny, len } = normalizeXY(targetX - from.x, targetY - from.y);
        if (len > 0) {
            out.push(overlayCachedArrowHead(targetX, targetY, nx, ny, { fill: color }));
            return;
        }
    }
    if (pathNodes.length >= 2) {
        const n = pathNodes.length;
        const tip = pathNodes[n - 1];
        const { nx, ny, len } = normalizeXY(tip.x - pathNodes[n - 2].x, tip.y - pathNodes[n - 2].y);
        if (len > 0) out.push(overlayCachedArrowHead(tip.x, tip.y, nx, ny, { fill: color }));
    }
}
function appendFlowAgentArrow(out, overlay) {
    const { propX, propY, propRadius, dirX, dirY, targetX, targetY } = overlay;
    if (dirX != null && dirY != null) {
        const color = "rgba(76, 175, 80, 0.85)";
        out.push(overlayCachedFlowDirectionArrow(propX, propY, dirX, dirY, { pad: propRadius + FLOW_ARROW_PAD, len: FLOW_ARROW_LEN, stroke: color, lineWidth: PATH_STROKE_WIDTH }));
        return;
    }
    if (targetX != null && targetY != null)
        out.push(overlayCachedCircleFillStroke(targetX, targetY, 4, { fill: "rgba(255, 193, 7, 0.85)" }, OVERLAY_RENDER_KEY.PathDestination, pathDestinationCacheKey(4, "rgba(255, 193, 7, 0.85)")));
}
function appendNormalPathOverlayCommands(out, overlay) {
    const { mode, targetX, targetY, pathNodes } = overlay;
    if (mode === "direct") {
        if (pathNodes.length < 2) return;
        out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.55)", lineWidth: 1.5, dash: [4, 4] }));
        out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.85)", lineWidth: PATH_STROKE_WIDTH }));
        const end = pathNodes[pathNodes.length - 1];
        out.push(overlayCircleStroke(end.x, end.y, 4, { stroke: "rgba(0, 188, 212, 0.85)", lineWidth: PATH_STROKE_WIDTH }));
        return;
    }
    if (mode === "flow") {
        appendFlowAgentArrow(out, overlay);
        return;
    }
    const hpaColor = "rgba(156, 39, 176, 0.9)";
    if (pathNodes.length) out.push(overlayPolyline(pathNodes, { stroke: "rgba(156, 39, 176, 0.65)", lineWidth: HPA_STROKE_WIDTH }));
    appendPathEndArrow(out, pathNodes ?? [], targetX, targetY, hpaColor);
}
function appendAbstractPathCommands(out, abstractPath, grid, pathPlanner = "hpa") {
    if (abstractPath.length < 2) return;
    const isLocal = pathPlanner === "local";
    const lineColor = isLocal ? "#ff9800" : "#ffeb3b";
    const nodeColor = isLocal ? "#ffb74d" : "#ffeb3b";
    const endpointColor = isLocal ? "#f57c00" : "#ff9800";
    const points = [];
    for (let i = 0; i < abstractPath.length; i++) {
        const idx = abstractPath[i];
        points.push({ x: grid.gridCenterXByIdx(idx), y: grid.gridCenterYByIdx(idx) });
    }
    out.push(overlayPolyline(points, { stroke: lineColor, lineWidth: 5, dash: [12, 8] }));
    for (let i = 0; i < abstractPath.length; i++) {
        const idx = abstractPath[i];
        const isEndpoint = i === 0 || i === abstractPath.length - 1;
        const x = grid.gridCenterXByIdx(idx);
        const y = grid.gridCenterYByIdx(idx);
        out.push(
            overlayCachedCircleFillStroke(
                x,
                y,
                isEndpoint ? 8 : 10,
                { fill: isEndpoint ? endpointColor : nodeColor },
                OVERLAY_RENDER_KEY.PathDebugNode,
                pathDestinationCacheKey(isEndpoint ? 8 : 10, isEndpoint ? endpointColor : nodeColor),
            ),
        );
    }
}
export function appendPathOverlayCommands(out, overlay, grid, visual = "debug") {
    if (!overlay) return;
    if (visual === "normal") {
        appendNormalPathOverlayCommands(out, overlay);
        return;
    }
    const { mode, targetX, targetY, pathNodes, abstractPath, pathPlanner } = overlay;
    if (mode === "hpa") {
        if (abstractPath) appendAbstractPathCommands(out, abstractPath, grid, pathPlanner ?? "hpa");
        if (pathNodes.length >= 2) out.push(overlayPolyline(pathNodes, { stroke: "#00e5ff", lineWidth: 4 }));
        if (pathNodes.length >= 1) appendPathEndArrow(out, pathNodes, targetX, targetY, "rgba(156, 39, 176, 0.9)");
        for (let i = 0; i < pathNodes.length; i++)
            out.push(overlayCachedCircleFillStroke(pathNodes[i].x, pathNodes[i].y, 6, { fill: "#00e5ff" }, OVERLAY_RENDER_KEY.PathDebugNode, pathDestinationCacheKey(6, "#00e5ff")));
        return;
    }
    if (mode === "flow") {
        appendFlowAgentArrow(out, overlay);
        return;
    }
    if (pathNodes.length < 2) return;
    out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.65)", lineWidth: 3, dash: [8, 6] }));
    const end = pathNodes[pathNodes.length - 1];
    out.push(overlayCachedCircleFillStroke(end.x, end.y, 10, { fill: "rgba(0, 188, 212, 0.85)" }, OVERLAY_RENDER_KEY.PathDestination, pathDestinationCacheKey(10, "rgba(0, 188, 212, 0.85)")));
}
function drawAabbCommand(ctx, cmd) {
    drawAabbStyle(ctx, cmd, cmd);
}
function drawAimSegmentCommand(ctx, cmd) {
    const { x1, y1, x2, y2, color, lineWidth = 3, arrowhead = true, glow = true, glowHue = 180 } = cmd;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (lengthXY(dx, dy) < 0.5) return;
    ctx.save();
    if (glow) {
        ctx.shadowColor = `hsla(${glowHue}, 100%, 50%, 0.6)`;
        ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    strokeSegment(ctx, x1, y1, x2, y2);
    if (arrowhead) {
        const { nx, ny } = normalizeXY(dx, dy);
        drawArrowHeadAt(ctx, x2, y2, nx, ny, color, 8, 5);
    }
    ctx.restore();
}
export function drawOverlayCommands(ctx, commands, viewport) {
    if (!commands.length) return;
    ctx.save();
    for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        if (cmd.cache) {
            const { renderKey, customKey, worldSpan } = cmd.cache;
            let worldX = 0;
            let worldY = 0;
            if (cmd.cache.anchorX != null && cmd.cache.anchorY != null) {
                worldX = cmd.cache.anchorX;
                worldY = cmd.cache.anchorY;
            } else if (cmd.kind === "circleStroke" || cmd.kind === "circleFillStroke") {
                worldX = cmd.cx;
                worldY = cmd.cy;
            } else if (cmd.kind === "arrowHead") {
                worldX = cmd.x;
                worldY = cmd.y;
            } else if (cmd.kind === "directionArrow") {
                worldX = cmd.cx;
                worldY = cmd.cy;
            } else if (cmd.kind === "aabb") {
                worldX = (cmd.minX + cmd.maxX) * 0.5;
                worldY = (cmd.minY + cmd.maxY) * 0.5;
            }
            drawCachedOverlayGlyph(ctx, worldX, worldY, viewport, renderKey, customKey, worldSpan, (bakeCtx, bakeAnchorX, bakeAnchorY) => bakeOverlayCommand(bakeCtx, bakeAnchorX, bakeAnchorY, cmd));
            continue;
        }
        if (cmd.kind === "aabb") {
            drawAabbCommand(ctx, cmd);
            continue;
        }
        if (cmd.kind === "circleStroke") {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeCircle(ctx, cmd.cx, cmd.cy, cmd.r);
            if (cmd.dash?.length) ctx.setLineDash([]);
            continue;
        }
        if (cmd.kind === "circleFillStroke") {
            ctx.fillStyle = cmd.fill;
            ctx.strokeStyle = cmd.stroke ?? "#fff";
            ctx.lineWidth = cmd.lineWidth ?? 1;
            fillStrokeCircle(ctx, cmd.cx, cmd.cy, cmd.r);
            continue;
        }
        if (cmd.kind === "segment") {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.lineCap) ctx.lineCap = cmd.lineCap;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeSegment(ctx, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
            if (cmd.dash?.length) ctx.setLineDash([]);
            if (cmd.lineCap) ctx.lineCap = "butt";
            continue;
        }
        if (cmd.kind === "polyline") {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeOpenPolyline(ctx, cmd.points);
            if (cmd.dash?.length) ctx.setLineDash([]);
            continue;
        }
        if (cmd.kind === "arrowHead") {
            drawArrowHeadAt(ctx, cmd.x, cmd.y, cmd.dirX, cmd.dirY, cmd.fill, cmd.headLen ?? 9, cmd.headWidth ?? 6);
            continue;
        }
        if (cmd.kind === "directionArrow") {
            bakeOverlayCommand(ctx, cmd.cx, cmd.cy, cmd);
            continue;
        }
        if (cmd.kind === "aimSegment") drawAimSegmentCommand(ctx, cmd);
    }
    ctx.restore();
}
/**
 * Map an image onto a latitudinal band of a rolled sphere (full wrap).
 * Prefer {@link drawSphereTexturePatch} for localized decals such as ball numbers.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {CanvasImageSource} img
 * @param {{
 *   baseRadius?: number,
 *   latBands?: number,
 *   lonBands?: number,
 *   vMin?: number,
 *   vMax?: number,
 *   uvBleed?: number,
 * }} [options]
 */
export function drawSphereTextureBand(ctx, prop, viewport, img, options = {}) {
    const vMin = options.vMin ?? 0.35;
    const vMax = options.vMax ?? 0.65;
    const phiMid = Math.PI * (vMin + vMax) * 0.5;
    const phiHalf = Math.PI * (vMax - vMin) * 0.5;
    drawSphereTexturePatch(ctx, prop, viewport, img, {
        baseRadius: options.baseRadius,
        phiCenter: phiMid,
        phiHalf,
        thetaCenter: Math.PI,
        thetaHalf: Math.PI,
        phiSegments: options.latBands ?? 8,
        thetaSegments: options.lonBands ?? 16,
        uvBleed: options.uvBleed,
    });
}
function ensureFlatProjectedVertScratch(count) {
    if (sFlatProjectedVerts.length < count * 2) sFlatProjectedVerts = new Float32Array(count * 2);
}
export function projectPropVertexScalarsInto(out8, offset, prop, viewport, lx, ly, lz) {
    const wx = prop.x + lx;
    const wy = prop.y + ly;
    if (Math.abs(lz) <= 0.001) {
        out8[offset] = wx;
        out8[offset + 1] = wy;
        return;
    }
    const alpha = resolveElevationAlpha(lz, viewport);
    if (alpha <= 0) {
        out8[offset] = wx;
        out8[offset + 1] = wy;
    } else {
        out8[offset] = wx + (wx - viewport.x) * alpha;
        out8[offset + 1] = wy + (wy - viewport.y) * alpha;
    }
}
export function isPropMeshFaceVisible(prop, viewport, verts3d) {
    const v0 = verts3d[0];
    const v1 = verts3d[1];
    const v2 = verts3d[2];
    const ax = v1.lx - v0.lx;
    const ay = v1.ly - v0.ly;
    const az = v1.z - v0.z;
    const bx = v2.lx - v0.lx;
    const by = v2.ly - v0.ly;
    const bz = v2.z - v0.z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const cx = prop.x + (v0.lx + v1.lx + v2.lx) / 3;
    const cy = prop.y + (v0.ly + v1.ly + v2.ly) / 3;
    const cz = (v0.z + v1.z + v2.z) / 3;
    const vx = viewport.x - cx;
    const vy = viewport.y - cy;
    const vz = viewport.cameraHeight - cz;
    return nx * vx + ny * vy + nz * vz > 0;
}
export function drawPropMeshFace(ctx, prop, viewport, verts3d, fill, stroke, lineWidth) {
    const count = verts3d.length;
    ensureFlatProjectedVertScratch(count);
    for (let i = 0; i < count; i++) {
        const v = verts3d[i];
        projectPropVertexScalarsInto(sFlatProjectedVerts, i * 2, prop, viewport, v.lx, v.ly, v.z);
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sFlatProjectedVerts, count);
    ctx.fill();
    if (stroke != null && stroke !== false && lineWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
    }
}
/**
 * Build lat/long sphere mesh resting on the ground, then apply roll orientation.
 * Each face carries normalized UV bounds for texture mapping.
 *
 * @param {number} radius
 * @param {number} latBands
 * @param {number} lonBands
 * @param {{ w: number, x: number, y: number, z: number }} rollQuat
 */
export function buildSphereMesh(radius, latBands, lonBands, rollQuat) {
    const rows = [];
    for (let lat = 0; lat <= latBands; lat++) {
        const phi = (lat / latBands) * Math.PI;
        const row = [];
        if (Math.sin(phi) < 1e-6) {
            const pole = sphereLocalVertex(radius, phi, 0);
            const rotated = transformRollVertex(pole.lx, pole.ly, pole.z, radius, rollQuat);
            row.push({ ...rotated, lon: 0 });
        } else
            for (let lon = 0; lon < lonBands; lon++) {
                const theta = (lon / lonBands) * Math.PI * 2;
                const local = sphereLocalVertex(radius, phi, theta);
                const rotated = transformRollVertex(local.lx, local.ly, local.z, radius, rollQuat);
                row.push({ ...rotated, lon });
            }
        rows.push(row);
    }
    const faces = [];
    for (let lat = 0; lat < latBands; lat++) {
        const rowA = rows[lat];
        const rowB = rows[lat + 1];
        const northPole = rowA.length === 1;
        const southPole = rowB.length === 1;
        const lat0 = lat / latBands;
        const lat1 = (lat + 1) / latBands;
        if (northPole) {
            const apex = rowA[0];
            for (let lon = 0; lon < lonBands; lon++) {
                const ln = (lon + 1) % lonBands;
                faces.push({ verts: [apex, rowB[ln], rowB[lon]], panel: lon, lat0, lat1, lon0: lon / lonBands, lon1: (lon + 1) / lonBands, depth: (apex.z + rowB[lon].z + rowB[ln].z) / 3 });
            }
            continue;
        }
        if (southPole) {
            const apex = rowB[0];
            for (let lon = 0; lon < lonBands; lon++) {
                const ln = (lon + 1) % lonBands;
                faces.push({ verts: [rowA[lon], rowA[ln], apex], panel: lon, lat0, lat1, lon0: lon / lonBands, lon1: (lon + 1) / lonBands, depth: (apex.z + rowA[lon].z + rowA[ln].z) / 3 });
            }
            continue;
        }
        for (let lon = 0; lon < lonBands; lon++) {
            const ln = (lon + 1) % lonBands;
            const v00 = rowA[lon];
            const v01 = rowA[ln];
            const v10 = rowB[lon];
            const v11 = rowB[ln];
            const lon0 = lon / lonBands;
            const lon1 = (lon + 1) / lonBands;
            faces.push({ verts: [v00, v01, v11], panel: lon, lat0, lat1, lon0, lon1, depth: (v00.z + v01.z + v11.z) / 3 });
            faces.push({ verts: [v00, v11, v10], panel: lon, lat0, lat1, lon0, lon1, depth: (v00.z + v11.z + v10.z) / 3 });
        }
    }
    return faces;
}
const DEFAULT_PANEL_COLORS = ["#F44336", "#FFEB3B", "#2196F3", "#4CAF50", "#FF9800", "#FFFFFF"];
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {{
 *   baseRadius?: number,
 *   panelCount?: number,
 *   latBands?: number,
 *   panelColors?: string[],
 *   getFaceColor?: (face: object) => string,
 *   stroke?: string | null | false,
 *   lineWidth?: number,
 * }} [options]
 */
export function drawSphere(ctx, prop, viewport, options = {}) {
    const radius = options.baseRadius ?? resolveBodyRadius(prop);
    const panelCount = Math.max(3, options.panelCount ?? 6);
    const latBands = Math.max(3, options.latBands ?? 5);
    const lonBands = panelCount;
    const panelColors = options.panelColors ?? DEFAULT_PANEL_COLORS;
    const getFaceColor = options.getFaceColor;
    const stroke = "stroke" in options ? options.stroke : "#2a2a2a";
    const lineWidth = options.lineWidth ?? 1.2;
    const rollQuat = prop.rollQuat ?? IDENTITY_ROLL_QUAT;
    const mesh = buildSphereMesh(radius, latBands, lonBands, rollQuat);
    const backFaces = [];
    const frontFaces = [];
    for (const face of mesh)
        if (isPropMeshFaceVisible(prop, viewport, face.verts)) frontFaces.push(face);
        else backFaces.push(face);
    const drawPass = (faces) => {
        const sorted = [...faces].sort((a, b) => a.depth - b.depth);
        for (const face of sorted) {
            const fill = getFaceColor ? getFaceColor(face) : panelColors[face.panel % panelColors.length];
            drawPropMeshFace(ctx, prop, viewport, face.verts, fill, stroke, lineWidth);
        }
    };
    drawPass(backFaces);
    drawPass(frontFaces);
}
export const DEFAULT_PROP_HEIGHT = 14;
export const RADIAL_SEGMENTS = 14;
let sBaseRing = new Float32Array(0);
let sTopRing = new Float32Array(0);
let sCapSrcRing = new Float32Array(0);
let sFaceVisible = new Uint8Array(0);
let sFaceMidY = new Float32Array(0);
let sFaceOrder = new Int32Array(0);
function ensurePrismScratch(vertexCount) {
    const ringLen = vertexCount * 2;
    if (sBaseRing.length < ringLen) {
        sBaseRing = new Float32Array(ringLen);
        sTopRing = new Float32Array(ringLen);
        sCapSrcRing = new Float32Array(ringLen);
        sFaceVisible = new Uint8Array(vertexCount);
        sFaceMidY = new Float32Array(vertexCount);
        sFaceOrder = new Int32Array(vertexCount);
    }
}
function fillBoxFootprintInto(out, hx, hy) {
    out[0] = -hx;
    out[1] = -hy;
    out[2] = hx;
    out[3] = -hy;
    out[4] = hx;
    out[5] = hy;
    out[6] = -hx;
    out[7] = hy;
}
function fillPinwheelOutlineInto(out, length, thickness) {
    const halfL = length / 2;
    const halfT = thickness / 2;
    out[0] = -halfT;
    out[1] = -halfL;
    out[2] = halfT;
    out[3] = -halfL;
    out[4] = halfT;
    out[5] = -halfT;
    out[6] = halfL;
    out[7] = -halfT;
    out[8] = halfL;
    out[9] = halfT;
    out[10] = halfT;
    out[11] = halfT;
    out[12] = halfT;
    out[13] = halfL;
    out[14] = -halfT;
    out[15] = halfL;
    out[16] = -halfT;
    out[17] = halfT;
    out[18] = -halfL;
    out[19] = halfT;
    out[20] = -halfL;
    out[21] = -halfT;
    out[22] = -halfT;
    out[23] = -halfT;
}
function isFaceVisible(viewport, originX, originY, edgeMidX, edgeMidY) {
    return isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, viewport.x, viewport.y);
}
function drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors) {
    const { cx, cy, topX, topY, viewAngle } = projection;
    const perpA = viewAngle + Math.PI / 2;
    const perpB = viewAngle - Math.PI / 2;
    const baseLeftX = cx + Math.cos(perpA) * baseRadius;
    const baseLeftY = cy + Math.sin(perpA) * baseRadius;
    const baseRightX = cx + Math.cos(perpB) * baseRadius;
    const baseRightY = cy + Math.sin(perpB) * baseRadius;
    ctx.beginPath();
    ctx.moveTo(baseLeftX, baseLeftY);
    traceVisibleArc(ctx, cx, cy, baseRadius, perpA, perpB, viewAngle);
    if (resolvedTop === 0) ctx.lineTo(topX, topY);
    else {
        const topRightX = topX + Math.cos(perpB) * resolvedTop;
        const topRightY = topY + Math.sin(perpB) * resolvedTop;
        ctx.lineTo(topRightX, topRightY);
        traceVisibleArc(ctx, topX, topY, resolvedTop, perpB, perpA, viewAngle);
    }
    ctx.closePath();
    ctx.fillStyle = createSideGradientAt(ctx, baseLeftX, baseLeftY, baseRightX, baseRightY, viewAngle + Math.PI, colors);
    ctx.fill();
}
export function drawExtrudedRadial(ctx, prop, viewport, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const { topRadius, height, facing = prop.facing, colors } = options;
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));
    drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors);
    return { projection, orientAngle: facing };
}
export function drawRadialBand(ctx, prop, viewport, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const { topRadius = null, height = DEFAULT_PROP_HEIGHT, t0, t1, fill, stroke, lineWidth = 0.8, facing = prop.facing, segments = RADIAL_SEGMENTS } = options;
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));
    const { cx, cy } = projection;
    for (let i = 0; i < segments; i++) {
        const a0 = facing + (i / segments) * Math.PI * 2;
        const a1 = facing + ((i + 1) / segments) * Math.PI * 2;
        pointOnFrustumInto(sBandQuad, 0, projection, baseRadius, resolvedTop, t0, a0);
        pointOnFrustumInto(sBandQuad, 2, projection, baseRadius, resolvedTop, t0, a1);
        const edgeMidX = (sBandQuad[0] + sBandQuad[2]) * 0.5;
        const edgeMidY = (sBandQuad[1] + sBandQuad[3]) * 0.5;
        if (!isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY)) continue;
        pointOnFrustumInto(sBandQuad, 4, projection, baseRadius, resolvedTop, t1, a1);
        pointOnFrustumInto(sBandQuad, 6, projection, baseRadius, resolvedTop, t1, a0);
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceFlatQuad(ctx, sBandQuad[0], sBandQuad[1], sBandQuad[2], sBandQuad[3], sBandQuad[4], sBandQuad[5], sBandQuad[6], sBandQuad[7]);
        ctx.fill();
        ctx.stroke();
    }
    const slice1 = getHeightSlice(projection, radiusAtT(baseRadius, resolvedTop, t0), t0);
    const slice2 = getHeightSlice(projection, radiusAtT(baseRadius, resolvedTop, t1), t1);
    return { projection, orientAngle: facing, slice1, slice2 };
}
function drawSideFaceFlat(ctx, edgeIndex, count, originX, originY, colors, { stroke, lineWidth, plankTs, drawPlanks }) {
    const ai = edgeIndex * 2;
    const bi = ((edgeIndex + 1) % count) * 2;
    const edgeMidX = (sBaseRing[ai] + sBaseRing[bi]) * 0.5;
    const edgeMidY = (sBaseRing[ai + 1] + sBaseRing[bi + 1]) * 0.5;
    const shadeAngle = Math.atan2(edgeMidY - originY, edgeMidX - originX);
    ctx.fillStyle = createSideGradientAt(ctx, sBaseRing[ai], sBaseRing[ai + 1], sBaseRing[bi], sBaseRing[bi + 1], shadeAngle, colors);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    traceFlatQuad(ctx, sTopRing[ai], sTopRing[ai + 1], sTopRing[bi], sTopRing[bi + 1], sBaseRing[bi], sBaseRing[bi + 1], sBaseRing[ai], sBaseRing[ai + 1]);
    ctx.fill();
    ctx.stroke();
    if (drawPlanks && plankTs) {
        ctx.strokeStyle = plankTs.stroke ?? "rgba(0,0,0,0.55)";
        ctx.lineWidth = plankTs.lineWidth ?? 0.8;
        for (const t of plankTs.values) {
            const xA = sTopRing[ai] + (sBaseRing[ai] - sTopRing[ai]) * t;
            const yA = sTopRing[ai + 1] + (sBaseRing[ai + 1] - sTopRing[ai + 1]) * t;
            const xB = sTopRing[bi] + (sBaseRing[bi] - sTopRing[bi]) * t;
            const yB = sTopRing[bi + 1] + (sBaseRing[bi + 1] - sTopRing[bi + 1]) * t;
            ctx.beginPath();
            ctx.moveTo(xA, yA);
            ctx.lineTo(xB, yB);
            ctx.stroke();
        }
    }
}
function classifyPrismFaces(count, viewport, cx, cy, faceOrder, localVerts, facing) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    for (let i = 0; i < count; i++) {
        const ai = i * 2;
        const bi = ((i + 1) % count) * 2;
        const edgeMidX = (sBaseRing[ai] + sBaseRing[bi]) * 0.5;
        const edgeMidY = (sBaseRing[ai + 1] + sBaseRing[bi + 1]) * 0.5;
        sFaceMidY[i] = (sBaseRing[ai + 1] + sBaseRing[bi + 1] + sTopRing[ai + 1] + sTopRing[bi + 1]) * 0.25;
        if (faceOrder === "midY") {
            const pAx = localVerts[ai];
            const pAy = localVerts[ai + 1];
            const pBx = localVerts[bi];
            const pBy = localVerts[bi + 1];
            const lx = pBy - pAy;
            const ly = -(pBx - pAx);
            const worldNx = lx * cos - ly * sin;
            const worldNy = lx * sin + ly * cos;
            const midX = (sBaseRing[ai] + sBaseRing[bi] + sTopRing[ai] + sTopRing[bi]) * 0.25;
            const midY = sFaceMidY[i];
            sFaceVisible[i] = isOutwardFaceTowardViewer(midX, midY, worldNx, worldNy, viewport.x, viewport.y) ? 1 : 0;
        } else sFaceVisible[i] = isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY) ? 1 : 0;
        sFaceOrder[i] = i;
    }
    if (faceOrder === "midY") sFaceOrder.subarray(0, count).sort((a, b) => sFaceMidY[a] - sFaceMidY[b]);
}
function drawTexturedPrism(ctx, prop, localVerts, count, height, facing, projection, textures) {
    const textureScale = textures.scale;
    const sideSrcHeight = (prop.wallChunkHeightPx ?? height) * textureScale;
    for (let pass = 0; pass < 2; pass++) {
        const wantFront = pass === 1;
        for (let i = 0; i < count; i++) {
            if ((sFaceVisible[i] === 1) !== wantFront) continue;
            const ai = i * 2;
            const bi = ((i + 1) % count) * 2;
            ctx.save();
            ctx.beginPath();
            traceFlatQuad(ctx, sTopRing[ai], sTopRing[ai + 1], sTopRing[bi], sTopRing[bi + 1], sBaseRing[bi], sBaseRing[bi + 1], sBaseRing[ai], sBaseRing[ai + 1]);
            ctx.clip();
            const baseTransform = ctx.getTransform();
            drawImageQuadFromFlatRingsWithBaseTransform(
                ctx,
                textures.sideCanvas,
                0,
                0,
                textures.sideCanvas.width,
                sideSrcHeight,
                sBaseRing,
                sTopRing,
                i,
                count,
                baseTransform.a,
                baseTransform.b,
                baseTransform.c,
                baseTransform.d,
                baseTransform.e,
                baseTransform.f,
            );
            ctx.restore();
        }
    }
    ctx.save();
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sTopRing, count);
    ctx.clip();
    const chunkSizePx = textures.chunkSizePx;
    const offset = chunkSizePx / 2;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        const topLx = scaleAtHeight(lx, projection.alpha, 1);
        const topLy = scaleAtHeight(ly, projection.alpha, 1);
        const rx = topLx * cos - topLy * sin;
        const ry = topLx * sin + topLy * cos;
        sCapSrcRing[i * 2] = (rx + offset) * textureScale;
        sCapSrcRing[i * 2 + 1] = (ry + offset) * textureScale;
    }
    const baseTransform = ctx.getTransform();
    for (let i = 1; i < count - 1; i++)
        drawImageTriangleFlatWithBaseTransform(
            ctx,
            textures.capCanvas,
            sCapSrcRing,
            sTopRing,
            0,
            i,
            i + 1,
            baseTransform.a,
            baseTransform.b,
            baseTransform.c,
            baseTransform.d,
            baseTransform.e,
            baseTransform.f,
        );
    ctx.restore();
}
function drawExtrudedPrism(ctx, prop, viewport, localVerts, opts) {
    const {
        height = DEFAULT_PROP_HEIGHT,
        facing = prop.facing,
        faceColors,
        backFaceColors = null,
        bottomColors = null,
        topColors,
        stroke,
        lineWidth = 1.0,
        plankTs,
        topCross,
        textures = null,
        faceOrder = "convexCull",
        prismPass = "all",
        topHalfSize = null,
        baseGradCornerB = 1,
    } = opts;
    const count = localVerts.length / 2;
    if (count < 3) return;
    ensurePrismScratch(count);
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const { cx, cy, topX, topY } = projection;
    extrudeLocalVertsInto(sBaseRing, sTopRing, localVerts, projection, facing);
    classifyPrismFaces(count, viewport, cx, cy, faceOrder, localVerts, facing);
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
    const drawBase = prismPass === "all" || prismPass === "base";
    const drawSides = prismPass === "all" || prismPass === "sides";
    const drawTop = prismPass === "all" || prismPass === "top";
    if (textures) {
        if (drawSides || drawTop) drawTexturedPrism(ctx, prop, localVerts, count, height, facing, projection, textures);
        return;
    }
    if (drawBase) {
        const gradB = Math.min(baseGradCornerB, count - 1);
        const baseGrad = ctx.createLinearGradient(sBaseRing[0], sBaseRing[1], sBaseRing[gradB * 2], sBaseRing[gradB * 2 + 1]);
        baseGrad.addColorStop(0.0, baseColors.light);
        baseGrad.addColorStop(0.5, baseColors.mid);
        baseGrad.addColorStop(1.0, baseColors.dark);
        ctx.fillStyle = baseGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedFlatPolygon(ctx, sBaseRing, count);
        ctx.fill();
        if (stroke) ctx.stroke();
    }
    if (drawSides)
        if (faceOrder === "midY")
            for (let o = 0; o < count; o++) {
                const i = sFaceOrder[o];
                const colors = sFaceVisible[i] ? faceColors : backColors;
                drawSideFaceFlat(ctx, i, count, cx, cy, colors, { stroke, lineWidth, plankTs, drawPlanks: sFaceVisible[i] === 1 });
            }
        else
            for (let pass = 0; pass < 2; pass++) {
                const wantFront = pass === 1;
                for (let i = 0; i < count; i++) {
                    if ((sFaceVisible[i] === 1) !== wantFront) continue;
                    const colors = wantFront ? faceColors : backColors;
                    drawSideFaceFlat(ctx, i, count, cx, cy, colors, { stroke, lineWidth, plankTs, drawPlanks: wantFront });
                }
            }
    if (drawTop) {
        let topGrad;
        if (topHalfSize) {
            const topHx = topHalfSize.x ?? topHalfSize.hx;
            const topHy = topHalfSize.y ?? topHalfSize.hy;
            topGrad = ctx.createLinearGradient(topX - topHx, topY - topHy, topX + topHx, topY + topHy);
        } else topGrad = ctx.createLinearGradient(topX, topY - 8, topX, topY + 8);
        topGrad.addColorStop(0.0, topColors.light);
        topGrad.addColorStop(0.5, topColors.mid);
        topGrad.addColorStop(1.0, topColors.dark);
        ctx.fillStyle = topGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedFlatPolygon(ctx, sTopRing, count);
        ctx.fill();
        if (stroke) ctx.stroke();
        if (topCross && count === 4) {
            ctx.strokeStyle = topCross.stroke ?? "rgba(0,0,0,0.6)";
            ctx.lineWidth = topCross.lineWidth ?? 0.8;
            ctx.beginPath();
            traceSegment(ctx, sTopRing[0], (sTopRing[1] + sTopRing[5]) / 2, sTopRing[2], (sTopRing[3] + sTopRing[7]) / 2);
            traceSegment(ctx, (sTopRing[0] + sTopRing[2]) / 2, sTopRing[1], (sTopRing[4] + sTopRing[6]) / 2, sTopRing[5]);
            ctx.stroke();
        }
    }
}
export function drawBox(
    ctx,
    prop,
    viewport,
    { halfSize, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    const hx = typeof halfSize === "number" ? halfSize : (halfSize.x ?? halfSize.hx);
    const hy = typeof halfSize === "number" ? halfSize : (halfSize.y ?? halfSize.hy);
    fillBoxFootprintInto(sBoxFootprint, hx, hy);
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const topHx = scaleAtHeight(hx, projection.alpha, 1);
    const topHy = scaleAtHeight(hy, projection.alpha, 1);
    drawExtrudedPrism(ctx, prop, viewport, sBoxFootprint, {
        height,
        facing,
        faceColors,
        backFaceColors,
        bottomColors,
        topColors,
        stroke,
        lineWidth,
        plankTs,
        topCross,
        faceOrder: "convexCull",
        baseGradCornerB: 2,
        topHalfSize: { x: topHx, y: topHy },
    });
}
export function drawExtrudedConvexPolygon(
    ctx,
    prop,
    viewport,
    { localVerts, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    const textures = prop.wallChunkProfileId && prop._wallChunkTextures?.ready ? prop._wallChunkTextures : null;
    drawExtrudedPrism(ctx, prop, viewport, localVerts, {
        height,
        facing,
        faceColors,
        backFaceColors,
        bottomColors,
        topColors,
        stroke,
        lineWidth,
        plankTs,
        topCross,
        textures,
        faceOrder: "convexCull",
    });
}
export function getWallChunkSpriteCacheKey(prop) {
    if (!prop.wallChunkProfileId) return "";
    const profileId = prop.wallChunkProfileId;
    const rev = getSurfaceProfileRevision(profileId);
    const readyBucket = prop._wallChunkTextureReady ? "ready" : "pending";
    return `wallchunk:${profileId}:${prop.wallChunkHeightPx}:${rev}:${readyBucket}`;
}
export function drawFlatWallChunkCap(ctx, prop, localVerts, facing = prop.facing) {
    const textures = prop._wallChunkTextures;
    if (!textures?.ready) return;
    const count = localVerts.length / 2;
    if (count < 3) return;
    ensurePrismScratch(count);
    const cos = Math.cos(facing ?? 0);
    const sin = Math.sin(facing ?? 0);
    const px = prop.x;
    const py = prop.y;
    const textureScale = textures.scale;
    const offset = textures.chunkSizePx / 2;
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        sTopRing[i * 2] = px + lx * cos - ly * sin;
        sTopRing[i * 2 + 1] = py + lx * sin + ly * cos;
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        sCapSrcRing[i * 2] = (rx + offset) * textureScale;
        sCapSrcRing[i * 2 + 1] = (ry + offset) * textureScale;
    }
    ctx.save();
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sTopRing, count);
    ctx.clip();
    const baseTransform = ctx.getTransform();
    for (let i = 1; i < count - 1; i++)
        drawImageTriangleFlatWithBaseTransform(
            ctx,
            textures.capCanvas,
            sCapSrcRing,
            sTopRing,
            0,
            i,
            i + 1,
            baseTransform.a,
            baseTransform.b,
            baseTransform.c,
            baseTransform.d,
            baseTransform.e,
            baseTransform.f,
        );
    ctx.restore();
}
export function drawFlatWallChunkProp(ctx, prop) {
    if (!prop.wallChunkProfileId || !prop._wallChunkTextures?.ready) return false;
    const parts = getEntityCollisionParts(prop);
    if (parts.length !== 1) return false;
    const verts = parts[0].vertices;
    if (!verts || verts.length < 6) return false;
    drawFlatWallChunkCap(ctx, prop, verts);
    return true;
}
export function drawExtrudedCompoundPolygon(
    ctx,
    prop,
    viewport,
    { partsVerts, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    if (prop.type === "cross_pinwheel") {
        const length = prop.crossLength ?? 32;
        const thickness = prop.crossThickness ?? 8;
        fillPinwheelOutlineInto(sPinwheelLocalVerts, length, thickness);
        drawExtrudedPrism(ctx, prop, viewport, sPinwheelLocalVerts, {
            height,
            facing,
            faceColors,
            backFaceColors,
            bottomColors,
            topColors,
            stroke,
            lineWidth,
            plankTs,
            topCross,
            faceOrder: "midY",
            baseGradCornerB: 6,
        });
        return;
    }
    const prismOpts = { height, facing, faceColors, backFaceColors, bottomColors, topColors, stroke, lineWidth, plankTs, topCross, faceOrder: "convexCull" };
    for (let i = 0; i < partsVerts.length; i++) drawExtrudedPrism(ctx, prop, viewport, partsVerts[i], { ...prismOpts, prismPass: "base" });
    for (let i = 0; i < partsVerts.length; i++) drawExtrudedPrism(ctx, prop, viewport, partsVerts[i], { ...prismOpts, prismPass: "sides" });
    for (let i = 0; i < partsVerts.length; i++) drawExtrudedPrism(ctx, prop, viewport, partsVerts[i], { ...prismOpts, prismPass: "top" });
}
export const DRAW_KIND_PROP = 1;
export const DRAW_KIND_VOXEL = 3;
export const DRAW_KIND_RAIL = 4;
function parallelInsertionSort(kinds, baseIndices, depths, refs, start, end) {
    for (let i = start + 1; i <= end; i++) {
        const keyKind = kinds[i];
        const keyBaseIndex = baseIndices[i];
        const keyDepth = depths[i];
        const keyRef = refs[i];
        let j = i - 1;
        while (j >= start && depths[j] < keyDepth) {
            kinds[j + 1] = kinds[j];
            baseIndices[j + 1] = baseIndices[j];
            depths[j + 1] = depths[j];
            refs[j + 1] = refs[j];
            j--;
        }
        kinds[j + 1] = keyKind;
        baseIndices[j + 1] = keyBaseIndex;
        depths[j + 1] = keyDepth;
        refs[j + 1] = keyRef;
    }
}
function heapify(kinds, baseIndices, depths, refs, n, i) {
    let root = i;
    while (true) {
        let smallest = root;
        const left = 2 * root + 1;
        const right = 2 * root + 2;
        if (left < n && depths[left] < depths[smallest]) smallest = left;
        if (right < n && depths[right] < depths[smallest]) smallest = right;
        if (smallest === root) break;
        const tempKind = kinds[root];
        kinds[root] = kinds[smallest];
        kinds[smallest] = tempKind;
        const tempBaseIndex = baseIndices[root];
        baseIndices[root] = baseIndices[smallest];
        baseIndices[smallest] = tempBaseIndex;
        const tempDepth = depths[root];
        depths[root] = depths[smallest];
        depths[smallest] = tempDepth;
        const tempRef = refs[root];
        refs[root] = refs[smallest];
        refs[smallest] = tempRef;
        root = smallest;
    }
}
function parallelHeapSort(kinds, baseIndices, depths, refs, n) {
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(kinds, baseIndices, depths, refs, n, i);
    for (let i = n - 1; i > 0; i--) {
        const tempKind = kinds[0];
        kinds[0] = kinds[i];
        kinds[i] = tempKind;
        const tempBaseIndex = baseIndices[0];
        baseIndices[0] = baseIndices[i];
        baseIndices[i] = tempBaseIndex;
        const tempDepth = depths[0];
        depths[0] = depths[i];
        depths[i] = tempDepth;
        const tempRef = refs[0];
        refs[0] = refs[i];
        refs[i] = tempRef;
        heapify(kinds, baseIndices, depths, refs, i, 0);
    }
}
export class VisibleDrawQueue {
    constructor(initialCapacity = 1024) {
        this.length = 0;
        this.kinds = new Uint8Array(initialCapacity);
        this.baseIndices = new Int32Array(initialCapacity);
        this.depths = new Float32Array(initialCapacity);
        this.refs = new Array(initialCapacity);
    }
    clear() {
        this.length = 0;
    }
    ensureCapacity(count) {
        if (this.kinds.length >= count) return;
        const nextCapacity = Math.max(this.kinds.length * 2, count);
        const nextKinds = new Uint8Array(nextCapacity);
        nextKinds.set(this.kinds);
        this.kinds = nextKinds;
        const nextBaseIndices = new Int32Array(nextCapacity);
        nextBaseIndices.set(this.baseIndices);
        this.baseIndices = nextBaseIndices;
        const nextDepths = new Float32Array(nextCapacity);
        nextDepths.set(this.depths);
        this.depths = nextDepths;
        this.refs.length = nextCapacity;
    }
    push(kind, baseIndex, ref, distSq) {
        this.ensureCapacity(this.length + 1);
        const i = this.length;
        this.kinds[i] = kind;
        this.baseIndices[i] = baseIndex;
        this.depths[i] = distSq;
        this.refs[i] = ref;
        this.length++;
    }
    sort() {
        const n = this.length;
        if (n <= 1) return;
        if (n <= 32) parallelInsertionSort(this.kinds, this.baseIndices, this.depths, this.refs, 0, n - 1);
        else parallelHeapSort(this.kinds, this.baseIndices, this.depths, this.refs, n);
    }
}
/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
const sGeomCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, faces: new StrideFloatList(VOXEL_FACE_STRIDE) };
export function wallGridDrawCacheHit(cache, grid, wallGridRevision, bounds) {
    return (
        cache.grid === grid &&
        cache.wallGridRevision === wallGridRevision &&
        cache.gridCols === grid.cols &&
        cache.gridRows === grid.rows &&
        cache.boundsMinX === bounds.minX &&
        cache.boundsMaxX === bounds.maxX &&
        cache.boundsMinY === bounds.minY &&
        cache.boundsMaxY === bounds.maxY
    );
}
export function storeWallGridDrawCache(cache, grid, wallGridRevision, bounds) {
    cache.grid = grid;
    cache.wallGridRevision = wallGridRevision;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = bounds.minX;
    cache.boundsMaxX = bounds.maxX;
    cache.boundsMinY = bounds.minY;
    cache.boundsMaxY = bounds.maxY;
}
export function collectStaticGridWallDrawables(obstacleGrid, viewport, outQueue) {
    const bounds = viewport.bounds("structure");
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sGeomCache, obstacleGrid, wallGridRevision, bounds)) {
        collectVoxelWallFacesInAabbFlat(obstacleGrid, bounds, sGeomCache.faces);
        storeWallGridDrawCache(sGeomCache, obstacleGrid, wallGridRevision, bounds);
    }
    const faces = sGeomCache.faces;
    const data = faces.data;
    const numFaces = faces.length;
    for (let i = 0; i < numFaces; i++) {
        const base = i * VOXEL_FACE_STRIDE;
        const cx = data[base + VOXEL_FACE.cx];
        const cy = data[base + VOXEL_FACE.cy];
        const outX = data[base + VOXEL_FACE.outX];
        const outY = data[base + VOXEL_FACE.outY];
        if (!isOutwardFaceTowardViewer(cx, cy, outX, outY, viewerX, viewerY)) continue;
        const viewX = cx - viewerX;
        const viewY = cy - viewerY;
        const distSq = viewX * viewX + viewY * viewY;
        outQueue.push(DRAW_KIND_VOXEL, base, null, distSq);
    }
}
export function getVoxelWallFaceData() {
    return sGeomCache.faces.data;
}
export function drawProjectedVoxelWallFaceFlat(ctx, baseIndex, viewport, state, face) {
    const data = sGeomCache.faces.data;
    const x1 = data[baseIndex + VOXEL_FACE.x1];
    const y1 = data[baseIndex + VOXEL_FACE.y1];
    const x2 = data[baseIndex + VOXEL_FACE.x2];
    const y2 = data[baseIndex + VOXEL_FACE.y2];
    drawProjectedWallFaceScalars(ctx, x1, y1, x2, y2, viewport, state, face);
}
export function invalidateStaticGridWallDrawCache() {
    sGeomCache.wallGridRevision = -1;
    sGeomCache.faces.clear();
}
const sBoxCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, boxes: new StrideFloatList(RAIL_BOX_STRIDE) };
function railWallBoxTowardViewerFlat(data, base, viewerX, viewerY) {
    const minX = data[base + RAIL_BOX.minX];
    const maxX = data[base + RAIL_BOX.maxX];
    const minY = data[base + RAIL_BOX.minY];
    const maxY = data[base + RAIL_BOX.maxY];
    if (viewerX >= minX && viewerX <= maxX && viewerY >= minY && viewerY <= maxY) return true;
    const innerP1x = data[base + RAIL_BOX.innerP1x];
    const innerP1y = data[base + RAIL_BOX.innerP1y];
    const innerP2x = data[base + RAIL_BOX.innerP2x];
    const innerP2y = data[base + RAIL_BOX.innerP2y];
    const outerP1x = data[base + RAIL_BOX.outerP1x];
    const outerP1y = data[base + RAIL_BOX.outerP1y];
    const outerP2x = data[base + RAIL_BOX.outerP2x];
    const outerP2y = data[base + RAIL_BOX.outerP2y];
    const inwardX = data[base + RAIL_BOX.inwardX];
    const inwardY = data[base + RAIL_BOX.inwardY];
    const innerMidX = (innerP1x + innerP2x) * 0.5;
    const innerMidY = (innerP1y + innerP2y) * 0.5;
    const outerMidX = (outerP1x + outerP2x) * 0.5;
    const outerMidY = (outerP1y + outerP2y) * 0.5;
    if (isOutwardFaceTowardViewer(innerMidX, innerMidY, inwardX, inwardY, viewerX, viewerY)) return true;
    if (isOutwardFaceTowardViewer(outerMidX, outerMidY, -inwardX, -inwardY, viewerX, viewerY)) return true;
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return false;
    const tx = dx / len;
    const ty = dy / len;
    if (isOutwardFaceTowardViewer((outerP1x + innerP1x) * 0.5, (outerP1y + innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) return true;
    if (isOutwardFaceTowardViewer((innerP2x + outerP2x) * 0.5, (innerP2y + outerP2y) * 0.5, tx, ty, viewerX, viewerY)) return true;
    return false;
}
export function collectStaticGridEdgeRailDrawables(obstacleGrid, viewport, outQueue) {
    const bounds = viewport.bounds("structure");
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sBoxCache, obstacleGrid, wallGridRevision, bounds)) {
        collectRailWallBoxesInAabb(obstacleGrid, bounds, sBoxCache.boxes);
        storeWallGridDrawCache(sBoxCache, obstacleGrid, wallGridRevision, bounds);
    }
    const boxes = sBoxCache.boxes;
    const data = boxes.data;
    const numBoxes = boxes.length;
    for (let i = 0; i < numBoxes; i++) {
        const base = i * RAIL_BOX_STRIDE;
        if (!railWallBoxTowardViewerFlat(data, base, viewerX, viewerY)) continue;
        const cx = data[base + RAIL_BOX.cx];
        const cy = data[base + RAIL_BOX.cy];
        const viewX = cx - viewerX;
        const viewY = cy - viewerY;
        const distSq = viewX * viewX + viewY * viewY;
        outQueue.push(DRAW_KIND_RAIL, base, null, distSq);
    }
}
export function getRailWallBoxData() {
    return sBoxCache.boxes.data;
}
export function drawProjectedGridEdgeRailFlat(ctx, baseIndex, viewport, state, face, skipWallCaps = false) {
    const data = sBoxCache.boxes.data;
    const base = baseIndex;
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const innerP1x = data[base + RAIL_BOX.innerP1x];
    const innerP1y = data[base + RAIL_BOX.innerP1y];
    const innerP2x = data[base + RAIL_BOX.innerP2x];
    const innerP2y = data[base + RAIL_BOX.innerP2y];
    const outerP1x = data[base + RAIL_BOX.outerP1x];
    const outerP1y = data[base + RAIL_BOX.outerP1y];
    const outerP2x = data[base + RAIL_BOX.outerP2x];
    const outerP2y = data[base + RAIL_BOX.outerP2y];
    const inwardX = data[base + RAIL_BOX.inwardX];
    const inwardY = data[base + RAIL_BOX.inwardY];
    if (isOutwardFaceTowardViewer((innerP1x + innerP2x) * 0.5, (innerP1y + innerP2y) * 0.5, inwardX, inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "inner";
        drawProjectedWallFaceScalars(ctx, innerP1x, innerP1y, innerP2x, innerP2y, viewport, state, face);
    }
    if (isOutwardFaceTowardViewer((outerP1x + outerP2x) * 0.5, (outerP1y + outerP2y) * 0.5, -inwardX, -inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "outer";
        drawProjectedWallFaceScalars(ctx, outerP1x, outerP1y, outerP2x, outerP2y, viewport, state, face);
    }
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        if (isOutwardFaceTowardViewer((outerP1x + innerP1x) * 0.5, (outerP1y + innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) {
            face.atlasFaceId = "end0";
            drawProjectedWallFaceScalars(ctx, outerP1x, outerP1y, innerP1x, innerP1y, viewport, state, face);
        }
        if (isOutwardFaceTowardViewer((innerP2x + outerP2x) * 0.5, (innerP2y + outerP2y) * 0.5, tx, ty, viewerX, viewerY)) {
            face.atlasFaceId = "end1";
            drawProjectedWallFaceScalars(ctx, innerP2x, innerP2y, outerP2x, outerP2y, viewport, state, face);
        }
    }
    face.atlasFaceId = undefined;
    if (!skipWallCaps) drawProjectedRailWallCapFlat(ctx, data, base, viewport, state, face);
}
export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.boxes.clear();
}
/**
 * Projects wall faces via radial elevation projection and samples baked atlases from WorldSurfaceEngine.
 * Vertical bands: projectWorldPointInto. Horizontal caps: box top ring + per-corner chunk UV.
 */
const sharedScratchFace = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
const sFaceBottom = { proj1X: 0, proj1Y: 0, proj2X: 0, proj2Y: 0 };
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
    return (face.gridIdx * 4 + face.gridSide) * 5 + wallFaceKindIndex(face.atlasFaceId);
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
let sProjectedSphereCellsData = new Float32Array(1024 * 13);
let sCellIndices = new Int32Array(1024);
let sRawCellsData = new Float32Array(1024 * 17);
function ensureProjectedCapacity(count) {
    if (sProjectedSphereCellsData.length < count * 13) {
        const newLen = Math.max(sProjectedSphereCellsData.length * 2, count * 13);
        sProjectedSphereCellsData = new Float32Array(newLen);
        sCellIndices = new Int32Array(newLen / 13);
    }
}
function ensureRawCapacity(count) {
    if (sRawCellsData.length < count * 17) {
        const newLen = Math.max(sRawCellsData.length * 2, count * 17);
        sRawCellsData = new Float32Array(newLen);
    }
}
function isFaceVisibleScalars(prop, viewport, v0lx, v0ly, v0z, v1lx, v1ly, v1z, v2lx, v2ly, v2z) {
    const ax = v1lx - v0lx;
    const ay = v1ly - v0ly;
    const az = v1z - v0z;
    const bx = v2lx - v0lx;
    const by = v2ly - v0ly;
    const bz = v2z - v0z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const cx = prop.x + (v0lx + v1lx + v2lx) / 3;
    const cy = prop.y + (v0ly + v1ly + v2ly) / 3;
    const cz = (v0z + v1z + v2z) / 3;
    const vx = viewport.x - cx;
    const vy = viewport.y - cy;
    const vz = viewport.cameraHeight - cz;
    return nx * vx + ny * vy + nz * vz > 0;
}
function isSphereQuadVisibleFlat(prop, viewport, data, base) {
    return (
        isFaceVisibleScalars(prop, viewport, data[base + 5], data[base + 6], data[base + 7], data[base + 8], data[base + 9], data[base + 10], data[base + 11], data[base + 12], data[base + 13]) ||
        isFaceVisibleScalars(prop, viewport, data[base + 5], data[base + 6], data[base + 7], data[base + 11], data[base + 12], data[base + 13], data[base + 14], data[base + 15], data[base + 16])
    );
}
function projectSphereCellIntoFlat(dest, destIndex, src, srcIndex, prop, viewport) {
    const sBase = srcIndex * 17;
    const dBase = destIndex * 13;
    dest[dBase + 0] = src[sBase + 0];
    dest[dBase + 1] = src[sBase + 1];
    dest[dBase + 2] = src[sBase + 2];
    dest[dBase + 3] = src[sBase + 3];
    dest[dBase + 4] = src[sBase + 4];
    projectPropVertexScalarsInto(dest, dBase + 5, prop, viewport, src[sBase + 5], src[sBase + 6], src[sBase + 7]);
    projectPropVertexScalarsInto(dest, dBase + 7, prop, viewport, src[sBase + 8], src[sBase + 9], src[sBase + 10]);
    projectPropVertexScalarsInto(dest, dBase + 9, prop, viewport, src[sBase + 11], src[sBase + 12], src[sBase + 13]);
    projectPropVertexScalarsInto(dest, dBase + 11, prop, viewport, src[sBase + 14], src[sBase + 15], src[sBase + 16]);
}
/**
 * Map an image onto a rolled spherical patch in radial elevation space.
 * Uses the same quad + affine texture path as inspect cylindrical labels.
 *
 * Prefer `capAngle` for circular decals (pool numbers).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {CanvasImageSource} img
 * @param {{
 *   baseRadius?: number,
 *   phiCenter?: number,
 *   thetaCenter?: number,
 *   capAngle?: number,
 *   phiHalf?: number,
 *   thetaHalf?: number,
 *   gridSegments?: number,
 *   phiSegments?: number,
 *   thetaSegments?: number,
 *   subSegments?: number,
 *   subPhi?: number,
 *   subTheta?: number,
 *   radiusInflate?: number,
 *   uvBleed?: number,
 * }} [options]
 */
export function drawSphereTexturePatch(ctx, prop, viewport, img, options = {}) {
    const radius = options.baseRadius ?? resolveBodyRadius(prop);
    const rollQuat = prop.rollQuat ?? IDENTITY_ROLL_QUAT;
    const phiCenter = options.phiCenter ?? Math.PI * 0.5;
    const thetaCenter = options.thetaCenter ?? 0;
    const radiusInflate = options.radiusInflate ?? 1;
    let rawCount = 0;
    if (options.capAngle != null) {
        const gridSegments = options.gridSegments ?? 18;
        const subSegments = options.subSegments ?? 2;
        const totalCapSegments = gridSegments * subSegments * gridSegments * subSegments;
        ensureRawCapacity(totalCapSegments);
        rawCount = tessellateSphereCapQuadsFlat(sRawCellsData, radius, rollQuat, phiCenter, thetaCenter, options.capAngle, gridSegments, subSegments, radiusInflate);
    } else {
        const phiSegments = options.phiSegments ?? 12;
        const thetaSegments = options.thetaSegments ?? 12;
        const subPhi = options.subPhi ?? 2;
        const subTheta = options.subTheta ?? 2;
        const totalSegments = phiSegments * subPhi * thetaSegments * subTheta;
        ensureRawCapacity(totalSegments);
        rawCount = tessellateSphereQuadsFlat(
            sRawCellsData,
            radius,
            rollQuat,
            phiCenter - (options.phiHalf ?? 0.42),
            phiCenter + (options.phiHalf ?? 0.42),
            thetaCenter - (options.thetaHalf ?? 0.42),
            thetaCenter + (options.thetaHalf ?? 0.42),
            phiSegments,
            thetaSegments,
            subPhi,
            subTheta,
            radiusInflate,
        );
    }
    ensureProjectedCapacity(rawCount);
    let projectedCount = 0;
    for (let i = 0; i < rawCount; i++) {
        const base = i * 17;
        if (!isSphereQuadVisibleFlat(prop, viewport, sRawCellsData, base)) continue;
        projectSphereCellIntoFlat(sProjectedSphereCellsData, projectedCount, sRawCellsData, i, prop, viewport);
        sCellIndices[projectedCount] = projectedCount;
        projectedCount++;
    }
    gatherTexturedQuadCellsFlat(sProjectedSphereCellsData, projectedCount, img, options.uvBleed ?? 1);
    drawTexturedQuadCellsFlat(ctx, sProjectedSphereCellsData, sCellIndices, projectedCount, img);
}
/**
 * Local sphere vertex resting on the ground (phi=π touches z=0).
 * phi=0 is the top pole; theta is azimuth in the ground plane.
 *
 * @param {number} radius
 * @param {number} phi 0…π colatitude from top pole
 * @param {number} theta 0…2π azimuth
 */
export function sphereLocalVertex(radius, phi, theta) {
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    return { lx: radius * sinPhi * Math.cos(theta), ly: radius * sinPhi * Math.sin(theta), z: radius * (1 + cosPhi) };
}
/**
 * @param {number} radius
 * @param {number} phi
 * @param {number} theta
 * @param {{ w: number, x: number, y: number, z: number }} rollQuat
 */
export function sphereRolledVertex(radius, phi, theta, rollQuat) {
    const v = sphereLocalVertex(radius, phi, theta);
    return transformRollVertex(v.lx, v.ly, v.z, radius, rollQuat);
}
/**
 * Tessellate a spherical UV patch into model-space quads (before world projection).
 *
 * @param {{
 *   radius: number,
 *   rollQuat: { w: number, x: number, y: number, z: number },
 *   phiMin: number,
 *   phiMax: number,
 *   thetaMin: number,
 *   thetaMax: number,
 *   phiSegments?: number,
 *   thetaSegments?: number,
 *   subPhi?: number,
 *   subTheta?: number,
 *   radiusInflate?: number,
 * }} spec
 * @returns {{ depth: number, u0: number, u1: number, v0: number, v1: number, verts: object[] }[]}
 */
export function tessellateSphereQuads({ radius, rollQuat, phiMin, phiMax, thetaMin, thetaMax, phiSegments = 8, thetaSegments = 8, subPhi = 2, subTheta = 2, radiusInflate = 1 } = {}) {
    const r = radius * radiusInflate;
    const cells = [];
    for (let pi = 0; pi < phiSegments; pi++)
        for (let spi = 0; spi < subPhi; spi++) {
            const v0 = (pi + spi / subPhi) / phiSegments;
            const v1 = (pi + (spi + 1) / subPhi) / phiSegments;
            const phi0 = phiMin + v0 * (phiMax - phiMin);
            const phi1 = phiMin + v1 * (phiMax - phiMin);
            for (let ti = 0; ti < thetaSegments; ti++)
                for (let sti = 0; sti < subTheta; sti++) {
                    const u0 = (ti + sti / subTheta) / thetaSegments;
                    const u1 = (ti + (sti + 1) / subTheta) / thetaSegments;
                    const theta0 = thetaMin + u0 * (thetaMax - thetaMin);
                    const theta1 = thetaMin + u1 * (thetaMax - thetaMin);
                    const m00 = sphereRolledVertex(r, phi0, theta0, rollQuat);
                    const m01 = sphereRolledVertex(r, phi0, theta1, rollQuat);
                    const m11 = sphereRolledVertex(r, phi1, theta1, rollQuat);
                    const m10 = sphereRolledVertex(r, phi1, theta0, rollQuat);
                    cells.push({ depth: (m00.z + m01.z + m11.z + m10.z) * 0.25, u0, u1, v0, v1, verts: [m00, m01, m11, m10] });
                }
        }
    return cells;
}
/**
 * Tessellate a circular spherical cap (tangent-plane patch) for decal-style wrapping.
 * Chordal bulge is minimized with dense cells; use radiusInflate=1 so quads sit on the body.
 *
 * @param {{
 *   radius: number,
 *   rollQuat: { w: number, x: number, y: number, z: number },
 *   phiCenter: number,
 *   thetaCenter: number,
 *   capAngle: number,
 *   gridSegments?: number,
 *   subSegments?: number,
 *   radiusInflate?: number,
 * }} spec
 */
export function tessellateSphereCapQuads({ radius, rollQuat, phiCenter, thetaCenter, capAngle, gridSegments = 16, subSegments = 2, radiusInflate = 1 } = {}) {
    const r = radius * radiusInflate;
    const sinPhi = Math.max(Math.sin(phiCenter), 0.35);
    const cells = [];
    const cornerToSphere = (lx, ly) => {
        const dPhi = ly * capAngle;
        const dTheta = (lx * capAngle) / sinPhi;
        return sphereRolledVertex(r, phiCenter + dPhi, thetaCenter + dTheta, rollQuat);
    };
    for (let gi = 0; gi < gridSegments; gi++)
        for (let sgi = 0; sgi < subSegments; sgi++) {
            const v0 = (gi + sgi / subSegments) / gridSegments;
            const v1 = (gi + (sgi + 1) / subSegments) / gridSegments;
            const ly0 = (v0 - 0.5) * 2;
            const ly1 = (v1 - 0.5) * 2;
            for (let ti = 0; ti < gridSegments; ti++)
                for (let sti = 0; sti < subSegments; sti++) {
                    const u0 = (ti + sti / subSegments) / gridSegments;
                    const u1 = (ti + (sti + 1) / subSegments) / gridSegments;
                    const lx0 = (u0 - 0.5) * 2;
                    const lx1 = (u1 - 0.5) * 2;
                    const midX = (lx0 + lx1) * 0.5;
                    const midY = (ly0 + ly1) * 0.5;
                    if (midX * midX + midY * midY > 1.04) continue;
                    const corners = [
                        [lx0, ly0],
                        [lx1, ly0],
                        [lx1, ly1],
                        [lx0, ly1],
                    ];
                    if (corners.every(([x, y]) => x * x + y * y > 1.02)) continue;
                    const m00 = cornerToSphere(lx0, ly0);
                    const m01 = cornerToSphere(lx1, ly0);
                    const m11 = cornerToSphere(lx1, ly1);
                    const m10 = cornerToSphere(lx0, ly1);
                    cells.push({ depth: (m00.z + m01.z + m11.z + m10.z) * 0.25, u0: (lx0 + 1) * 0.5, u1: (lx1 + 1) * 0.5, v0: (ly0 + 1) * 0.5, v1: (ly1 + 1) * 0.5, verts: [m00, m01, m11, m10] });
                }
        }
    return cells;
}
export function sphereRolledVertexInto(out, offset, radius, phi, theta, rollQuat) {
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const lx = radius * sinPhi * Math.cos(theta);
    const ly = radius * sinPhi * Math.sin(theta);
    const lz = radius * (1 + cosPhi);
    const rx = lx;
    const ry = ly;
    const rz = lz - radius;
    const qx = rollQuat.x;
    const qy = rollQuat.y;
    const qz = rollQuat.z;
    const qw = rollQuat.w;
    const ix = qw * rx + qy * rz - qz * ry;
    const iy = qw * ry + qz * rx - qx * rz;
    const iz = qw * rz + qx * ry - qy * rx;
    const iw = -qx * rx - qy * ry - qz * rz;
    out[offset] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out[offset + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out[offset + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx + radius;
}
export function tessellateSphereQuadsFlat(outData, radius, rollQuat, phiMin, phiMax, thetaMin, thetaMax, phiSegments = 8, thetaSegments = 8, subPhi = 2, subTheta = 2, radiusInflate = 1) {
    const r = radius * radiusInflate;
    let count = 0;
    for (let pi = 0; pi < phiSegments; pi++)
        for (let spi = 0; spi < subPhi; spi++) {
            const v0 = (pi + spi / subPhi) / phiSegments;
            const v1 = (pi + (spi + 1) / subPhi) / phiSegments;
            const phi0 = phiMin + v0 * (phiMax - phiMin);
            const phi1 = phiMin + v1 * (phiMax - phiMin);
            for (let ti = 0; ti < thetaSegments; ti++)
                for (let sti = 0; sti < subTheta; sti++) {
                    const u0 = (ti + sti / subTheta) / thetaSegments;
                    const u1 = (ti + (sti + 1) / subTheta) / thetaSegments;
                    const theta0 = thetaMin + u0 * (thetaMax - thetaMin);
                    const theta1 = thetaMin + u1 * (thetaMax - thetaMin);
                    const base = count * 17;
                    outData[base + 1] = u0;
                    outData[base + 2] = u1;
                    outData[base + 3] = v0;
                    outData[base + 4] = v1;
                    sphereRolledVertexInto(outData, base + 5, r, phi0, theta0, rollQuat);
                    sphereRolledVertexInto(outData, base + 8, r, phi0, theta1, rollQuat);
                    sphereRolledVertexInto(outData, base + 11, r, phi1, theta1, rollQuat);
                    sphereRolledVertexInto(outData, base + 14, r, phi1, theta0, rollQuat);
                    outData[base + 0] = (outData[base + 7] + outData[base + 10] + outData[base + 13] + outData[base + 16]) * 0.25;
                    count++;
                }
        }
    return count;
}
export function tessellateSphereCapQuadsFlat(outData, radius, rollQuat, phiCenter, thetaCenter, capAngle, gridSegments = 16, subSegments = 2, radiusInflate = 1) {
    const r = radius * radiusInflate;
    const sinPhi = Math.max(Math.sin(phiCenter), 0.35);
    let count = 0;
    for (let gi = 0; gi < gridSegments; gi++)
        for (let sgi = 0; sgi < subSegments; sgi++) {
            const v0 = (gi + sgi / subSegments) / gridSegments;
            const v1 = (gi + (sgi + 1) / subSegments) / gridSegments;
            const ly0 = (v0 - 0.5) * 2;
            const ly1 = (v1 - 0.5) * 2;
            for (let ti = 0; ti < gridSegments; ti++)
                for (let sti = 0; sti < subSegments; sti++) {
                    const u0 = (ti + sti / subSegments) / gridSegments;
                    const u1 = (ti + (sti + 1) / subSegments) / gridSegments;
                    const lx0 = (u0 - 0.5) * 2;
                    const lx1 = (u1 - 0.5) * 2;
                    const midX = (lx0 + lx1) * 0.5;
                    const midY = (ly0 + ly1) * 0.5;
                    if (midX * midX + midY * midY > 1.04) continue;
                    if (lx0 * lx0 + ly0 * ly0 > 1.02 && lx1 * lx1 + ly0 * ly0 > 1.02 && lx1 * lx1 + ly1 * ly1 > 1.02 && lx0 * lx0 + ly1 * ly1 > 1.02) continue;
                    const base = count * 17;
                    outData[base + 1] = (lx0 + 1) * 0.5;
                    outData[base + 2] = (lx1 + 1) * 0.5;
                    outData[base + 3] = (ly0 + 1) * 0.5;
                    outData[base + 4] = (ly1 + 1) * 0.5;
                    const dPhi0 = ly0 * capAngle;
                    const dTheta0 = (lx0 * capAngle) / sinPhi;
                    sphereRolledVertexInto(outData, base + 5, r, phiCenter + dPhi0, thetaCenter + dTheta0, rollQuat);
                    const dPhi0_2 = ly0 * capAngle;
                    const dTheta1 = (lx1 * capAngle) / sinPhi;
                    sphereRolledVertexInto(outData, base + 8, r, phiCenter + dPhi0_2, thetaCenter + dTheta1, rollQuat);
                    const dPhi1 = ly1 * capAngle;
                    const dTheta1_2 = (lx1 * capAngle) / sinPhi;
                    sphereRolledVertexInto(outData, base + 11, r, phiCenter + dPhi1, thetaCenter + dTheta1_2, rollQuat);
                    const dPhi1_2 = ly1 * capAngle;
                    const dTheta0_2 = (lx0 * capAngle) / sinPhi;
                    sphereRolledVertexInto(outData, base + 14, r, phiCenter + dPhi1_2, thetaCenter + dTheta0_2, rollQuat);
                    outData[base + 0] = (outData[base + 7] + outData[base + 10] + outData[base + 13] + outData[base + 16]) * 0.25;
                    count++;
                }
        }
    return count;
}
export function gatherTexturedQuadCellsFlat(data, count, img, uvBleed = 2) {
    const iw = img.width;
    const ih = img.height;
    for (let i = 0; i < count; i++) {
        const base = i * 13;
        const u0 = data[base + 1];
        const u1 = data[base + 2];
        const v0 = data[base + 3];
        const v1 = data[base + 4];
        data[base + 1] = u0 * iw - (u0 > 0 ? uvBleed : 0);
        data[base + 2] = u1 * iw + (u1 < 1 ? uvBleed : 0);
        data[base + 3] = v0 * ih - (v0 > 0 ? uvBleed : 0);
        data[base + 4] = v1 * ih + (v1 < 1 ? uvBleed : 0);
    }
}
export function drawTexturedQuadCellsFlat(ctx, data, indices, count, img) {
    if (count === 0) return;
    const sortedIndices = indices.subarray(0, count);
    sortedIndices.sort((a, b) => {
        return data[b * 13] - data[a * 13];
    });
    for (let i = 0; i < count; i++) {
        const base = sortedIndices[i] * 13;
        const sx0 = data[base + 1];
        const sx1 = data[base + 2];
        const sy0 = data[base + 3];
        const sy1 = data[base + 4];
        const d0x = data[base + 5];
        const d0y = data[base + 6];
        const d1x = data[base + 7];
        const d1y = data[base + 8];
        const d2x = data[base + 9];
        const d2y = data[base + 10];
        const d3x = data[base + 11];
        const d3y = data[base + 12];
        drawImageQuadScalars(ctx, img, sx0, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y, d3x, d3y);
    }
}
const CONVEYOR_BELT_HEIGHT = 0;
/** @returns {import("../Canvas/QuantizedSpriteCache.js").PropDrawRecipe} */
export function createConveyorDraw(options = {}) {
    const { turnDirection = null, chevronColors: chevronColorsOverride } = options;
    const chevronColors = chevronColorsOverride ?? { fill: "#0EA5E9", stroke: "#0284C7" };
    // Dark rubber colors for the moving belt bed
    const beltColors = {
        shadow: "#141414", // dark shadow
        mid: "#212121", // charcoal side
        highlight: "#373737", // slightly lighter highlights
    };
    const beltStroke = "#111111"; // dark outline
    const beltTopColors = {
        light: "#2b2b2b", // dark rubber bed
        mid: "#1e1e1e",
        dark: "#141414",
    };
    return (ctx, prop, viewport) => {
        const subProp = (x, y, facing) => ({ x, y, facing });
        const hx = prop.halfExtents?.x ?? 8;
        const hy = prop.halfExtents?.y ?? 8;
        const lineScale = getCanvasLineScale(ctx);
        if (!turnDirection) {
            const angle = prop.facing ?? 0;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            // Draw full-tile belt bed
            const beltProp = subProp(prop.x, prop.y, angle);
            drawBox(ctx, beltProp, viewport, {
                halfSize: { x: hx, y: hy },
                height: CONVEYOR_BELT_HEIGHT,
                facing: angle,
                faceColors: beltColors,
                topColors: beltTopColors,
                stroke: beltStroke,
                lineWidth: 1.0 * lineScale,
            });
            function projectLocalFlat(out8, offset, lx, ly, lz) {
                const r = rotateXY(lx, ly, cos, sin);
                projectPropVertexScalarsInto(out8, offset, prop, viewport, r.x, r.y, lz);
            }
            ctx.save();
            ctx.beginPath();
            projectLocalFlat(sScratchQuad, 0, -hx, -hy, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 2, hx, -hy, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 4, hx, hy, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 6, -hx, hy, CONVEYOR_BELT_HEIGHT);
            traceClosedFlatPolygon(ctx, sScratchQuad, 4);
            ctx.clip();
            const speed = 20;
            const spacing = 8;
            const timeSec = (prop.ageMs ?? 0) / 1000;
            const offset = (timeSec * speed) % spacing;
            ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
            ctx.lineWidth = 1.0 * lineScale;
            const numSlats = Math.ceil((hx * 2) / 4) + 2;
            for (let i = -2; i < numSlats; i++) {
                const cx = -hx + ((timeSec * speed) % 4) + i * 4;
                projectLocalFlat(sScratchQuad, 0, cx, -hy, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchQuad, 2, cx, hy, CONVEYOR_BELT_HEIGHT);
                ctx.beginPath();
                ctx.moveTo(sScratchQuad[0], sScratchQuad[1]);
                ctx.lineTo(sScratchQuad[2], sScratchQuad[3]);
                ctx.stroke();
            }
            ctx.fillStyle = chevronColors.fill;
            ctx.strokeStyle = chevronColors.stroke;
            ctx.lineWidth = 0.5 * lineScale;
            const numChevrons = Math.ceil((hx * 2) / spacing) + 2;
            for (let i = -2; i < numChevrons; i++) {
                const cx = -hx + offset + i * spacing;
                projectLocalFlat(sScratchChevron, 0, cx + 1.5, 0, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 2, cx - 1.2, 3.2, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 4, cx - 0.4, 3.2, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 6, cx + 0.8, 0, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 8, cx - 0.4, -3.2, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 10, cx - 1.2, -3.2, CONVEYOR_BELT_HEIGHT);
                ctx.beginPath();
                traceClosedFlatPolygon(ctx, sScratchChevron, 6);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        const angle = prop.facing ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const isLeft = turnDirection === "left";
        const pivotX = 8;
        const pivotY = isLeft ? 8 : -8;
        const startAngle = Math.PI;
        const dir = isLeft ? 1 : -1;
        const beltProp = subProp(prop.x, prop.y, angle);
        drawBox(ctx, beltProp, viewport, {
            halfSize: { x: hx, y: hy },
            height: CONVEYOR_BELT_HEIGHT,
            facing: angle,
            faceColors: beltColors,
            topColors: beltTopColors,
            stroke: beltStroke,
            lineWidth: 1.0 * lineScale,
        });
        function projectLocalFlat(out8, offset, lx, ly, lz) {
            const r = rotateXY(lx, ly, cos, sin);
            projectPropVertexScalarsInto(out8, offset, prop, viewport, r.x, r.y, lz);
        }
        ctx.save();
        ctx.beginPath();
        projectLocalFlat(sScratchQuad, 0, -hx, -hy, CONVEYOR_BELT_HEIGHT);
        projectLocalFlat(sScratchQuad, 2, hx, -hy, CONVEYOR_BELT_HEIGHT);
        projectLocalFlat(sScratchQuad, 4, hx, hy, CONVEYOR_BELT_HEIGHT);
        projectLocalFlat(sScratchQuad, 6, -hx, hy, CONVEYOR_BELT_HEIGHT);
        traceClosedFlatPolygon(ctx, sScratchQuad, 4);
        ctx.clip();
        const speed = 20;
        const spacing = 8;
        const timeSec = (prop.ageMs ?? 0) / 1000;
        const totalArcLength = (Math.PI / 2) * 8;
        const offset = (timeSec * speed) % spacing;
        ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
        ctx.lineWidth = 1.0 * lineScale;
        const numSlats = Math.ceil(totalArcLength / 4) + 2;
        for (let i = -1; i < numSlats; i++) {
            const s = ((timeSec * speed) % 4) + i * 4;
            if (s < 0 || s > totalArcLength) continue;
            const A = startAngle + dir * (s / 8);
            projectLocalFlat(sScratchQuad, 0, pivotX, pivotY, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 2, pivotX + 25 * Math.cos(A), pivotY + 25 * Math.sin(A), CONVEYOR_BELT_HEIGHT);
            ctx.beginPath();
            ctx.moveTo(sScratchQuad[0], sScratchQuad[1]);
            ctx.lineTo(sScratchQuad[2], sScratchQuad[3]);
            ctx.stroke();
        }
        ctx.fillStyle = chevronColors.fill;
        ctx.strokeStyle = chevronColors.stroke;
        ctx.lineWidth = 0.5 * lineScale;
        const numChevrons = Math.ceil(totalArcLength / spacing) + 2;
        for (let i = -1; i < numChevrons; i++) {
            const s = offset + i * spacing;
            if (s < -2 || s > totalArcLength + 2) continue;
            const A = startAngle + dir * (s / 8);
            const tipAngle = A + dir * (1.5 / 8);
            const wingAngle = A - dir * (1.2 / 8);
            const innerAngle = A - dir * (0.4 / 8);
            const innerTipAngle = A + dir * (0.8 / 8);
            projectLocalFlat(sScratchChevron, 0, pivotX + 8 * Math.cos(tipAngle), pivotY + 8 * Math.sin(tipAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 2, pivotX + (8 - 3.2) * Math.cos(wingAngle), pivotY + (8 - 3.2) * Math.sin(wingAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 4, pivotX + (8 - 3.2) * Math.cos(innerAngle), pivotY + (8 - 3.2) * Math.sin(innerAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 6, pivotX + 8 * Math.cos(innerTipAngle), pivotY + 8 * Math.sin(innerTipAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 8, pivotX + (8 + 3.2) * Math.cos(innerAngle), pivotY + (8 + 3.2) * Math.sin(innerAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 10, pivotX + (8 + 3.2) * Math.cos(wingAngle), pivotY + (8 + 3.2) * Math.sin(wingAngle), CONVEYOR_BELT_HEIGHT);
            ctx.beginPath();
            traceClosedFlatPolygon(ctx, sScratchChevron, 6);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    };
}
export function createFlatConveyorDraw(options = {}) {
    const { turnDirection = null, chevronColors: chevronColorsOverride } = options;
    const chevronColors = chevronColorsOverride ?? { fill: "#0EA5E9", stroke: "#0284C7" };
    const beltStroke = "#111111";
    const beltFill = "#1e1e1e";
    return (ctx, prop) => {
        const hx = prop.halfExtents?.x ?? 8;
        const hy = prop.halfExtents?.y ?? 8;
        const lineScale = getCanvasLineScale(ctx);
        const angle = prop.facing ?? 0;
        ctx.save();
        ctx.translate(prop.x, prop.y);
        ctx.rotate(angle);
        ctx.fillStyle = beltFill;
        ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
        ctx.strokeStyle = beltStroke;
        ctx.lineWidth = 1.0 * lineScale;
        ctx.strokeRect(-hx, -hy, hx * 2, hy * 2);
        ctx.beginPath();
        ctx.rect(-hx, -hy, hx * 2, hy * 2);
        ctx.clip();
        const speed = 20;
        const spacing = 8;
        const timeSec = (prop.ageMs ?? 0) / 1000;
        if (!turnDirection) {
            const offset = (timeSec * speed) % spacing;
            ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
            ctx.lineWidth = 1.0 * lineScale;
            const numSlats = Math.ceil((hx * 2) / 4) + 2;
            for (let i = -2; i < numSlats; i++) {
                const cx = -hx + ((timeSec * speed) % 4) + i * 4;
                ctx.beginPath();
                ctx.moveTo(cx, -hy);
                ctx.lineTo(cx, hy);
                ctx.stroke();
            }
            ctx.fillStyle = chevronColors.fill;
            ctx.strokeStyle = chevronColors.stroke;
            ctx.lineWidth = 0.5 * lineScale;
            const numChevrons = Math.ceil((hx * 2) / spacing) + 2;
            for (let i = -2; i < numChevrons; i++) {
                const cx = -hx + offset + i * spacing;
                ctx.beginPath();
                ctx.moveTo(cx + 1.5, 0);
                ctx.lineTo(cx - 1.2, 3.2);
                ctx.lineTo(cx - 0.4, 3.2);
                ctx.lineTo(cx + 0.8, 0);
                ctx.lineTo(cx - 0.4, -3.2);
                ctx.lineTo(cx - 1.2, -3.2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        const isLeft = turnDirection === "left";
        const pivotX = hx;
        const pivotY = isLeft ? hy : -hy;
        const startAngle = Math.PI;
        const dir = isLeft ? 1 : -1;
        const arcR = hx;
        const totalArcLength = (Math.PI / 2) * arcR;
        const offset = (timeSec * speed) % spacing;
        ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
        ctx.lineWidth = 1.0 * lineScale;
        const numSlats = Math.ceil(totalArcLength / 4) + 2;
        for (let i = -1; i < numSlats; i++) {
            const s = ((timeSec * speed) % 4) + i * 4;
            if (s < 0 || s > totalArcLength) continue;
            const A = startAngle + dir * (s / arcR);
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(pivotX + 25 * Math.cos(A), pivotY + 25 * Math.sin(A));
            ctx.stroke();
        }
        ctx.fillStyle = chevronColors.fill;
        ctx.strokeStyle = chevronColors.stroke;
        ctx.lineWidth = 0.5 * lineScale;
        const numChevrons = Math.ceil(totalArcLength / spacing) + 2;
        for (let i = -1; i < numChevrons; i++) {
            const s = offset + i * spacing;
            if (s < -2 || s > totalArcLength + 2) continue;
            const A = startAngle + dir * (s / arcR);
            const tipAngle = A + dir * (1.5 / arcR);
            const wingAngle = A - dir * (1.2 / arcR);
            const innerAngle = A - dir * (0.4 / arcR);
            const innerTipAngle = A + dir * (0.8 / arcR);
            ctx.beginPath();
            ctx.moveTo(pivotX + 8 * Math.cos(tipAngle), pivotY + 8 * Math.sin(tipAngle));
            ctx.lineTo(pivotX + (8 - 3.2) * Math.cos(wingAngle), pivotY + (8 - 3.2) * Math.sin(wingAngle));
            ctx.lineTo(pivotX + (8 - 3.2) * Math.cos(innerAngle), pivotY + (8 - 3.2) * Math.sin(innerAngle));
            ctx.lineTo(pivotX + 8 * Math.cos(innerTipAngle), pivotY + 8 * Math.sin(innerTipAngle));
            ctx.lineTo(pivotX + (8 + 3.2) * Math.cos(innerAngle), pivotY + (8 + 3.2) * Math.sin(innerAngle));
            ctx.lineTo(pivotX + (8 + 3.2) * Math.cos(wingAngle), pivotY + (8 + 3.2) * Math.sin(wingAngle));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    };
}
let floatingTextCache = null;
export const FLOATING_TEXT_SPAWN_EVENT = "fx:floatingText";
export const TextStyles = {
    standard: {
        font: "bold 10px monospace",
        strokeWidth: 1.0,
        scaleFn: (ageRatio) => {
            if (ageRatio < 0.15) return 1.4 - 0.4 * (ageRatio / 0.15);
            return 1.0;
        },
        getFill: (ctx, color) => color,
    },
};
export class FloatingText {
    constructor(x, y, text, color, timerId, styleName = "standard") {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.timerId = timerId;
        this.styleName = styleName;
        this.life = 1.0;
        this.isDead = false;
        this.vx = 0;
        this.vy = -20;
        this.gravity = 0;
        this.maxLife = 1000;
        this.style = TextStyles[styleName] || TextStyles.standard;
    }
    getCacheKey() {
        return `${this.styleName}_${this.color}_${this.text}`;
    }
    update(dt, scheduler) {
        const dtSec = dt / 1000;
        this.x += this.vx * dtSec;
        this.y += this.vy * dtSec;
        if (this.gravity) this.vy += this.gravity * dtSec;
        const remaining = scheduler.getTimeRemaining(this.timerId);
        this.life = remaining / this.maxLife;
        if (remaining <= 0) this.isDead = true;
    }
    static spawn(state, x, y, text, color, styleName = "standard", options = {}) {
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetY = (Math.random() - 0.5) * 16;
        const duration = options.duration || 1000;
        const timerId = state.scheduler.schedule(duration);
        const ft = new FloatingText(x + offsetX, y + offsetY, text, color, timerId, styleName);
        ft.maxLife = duration;
        ft.vx = options.vx !== undefined ? options.vx : 0;
        ft.vy = options.vy !== undefined ? options.vy : -20;
        ft.gravity = options.gravity !== undefined ? options.gravity : 0;
        state.floatingTexts.push(ft);
    }
    static updateAll(state, dt) {
        if (!state.floatingTexts) return;
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = state.floatingTexts[i];
            ft.update(dt, state.scheduler);
            if (ft.isDead) state.floatingTexts.splice(i, 1);
        }
    }
    static handleSpawnEvent({ state, variant = "custom", x, y, text, color, style, options }) {
        if (!state.floatingTexts) return;
        if (variant !== "custom") return;
        FloatingText.spawn(state, x, y, text, color, style ?? "standard", options ?? {});
    }
    render(ctx, renderer, state) {
        if (!floatingTextCache) floatingTextCache = new SpriteCache();
        const cacheKey = this.getCacheKey();
        const sprite = floatingTextCache.get(cacheKey, RenderSprites.floatingText, this.text, this.style, this.color);
        const img = sprite.offCanvas || sprite;
        const cx = sprite.cx !== undefined ? sprite.cx : img.width / 2;
        const cy = sprite.cy !== undefined ? sprite.cy : img.height / 2;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        const ageRatio = 1.0 - this.life;
        let scale = this.style.scaleFn(ageRatio);
        if (state && state.viewport) scale /= state.viewport.zoom;
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);
        ctx.drawImage(img, -cx, -cy);
        ctx.restore();
    }
}
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
const matchDebris = (p) => p.strategy?.renderMode === "debris";
const DEBRIS_QUERY_OPTIONS = { filterId: "debris", match: matchDebris };
const match3d = (p) => p.strategy?.renderMode === "3d";
const THREE_D_QUERY_OPTIONS = { filterId: "3d", match: match3d };
function bindWallFaceScratchFlat(scratch, kind, baseIndex) {
    scratch.atlasFaceId = undefined;
    if (kind === DRAW_KIND_RAIL) {
        const d = getRailWallBoxData();
        const b = baseIndex;
        scratch.wallHeight = d[b + RAIL_BOX.wallHeight];
        scratch.wallBaseZ = d[b + RAIL_BOX.wallBaseZ];
        scratch.wallCapHeight = d[b + RAIL_BOX.wallCapHeight];
        scratch.cacheObj = null;
        scratch.gridSide = d[b + RAIL_BOX.gridSide];
        scratch.gridIdx = d[b + RAIL_BOX.gridIdx];
        scratch.isEdgeRail = true;
    } else if (kind === DRAW_KIND_VOXEL) {
        const d = getVoxelWallFaceData();
        const b = baseIndex;
        scratch.wallHeight = d[b + VOXEL_FACE.wallHeight];
        scratch.wallBaseZ = d[b + VOXEL_FACE.wallBaseZ];
        scratch.wallCapHeight = d[b + VOXEL_FACE.wallCapHeight];
        scratch.cacheObj = null;
        scratch.gridSide = d[b + VOXEL_FACE.gridSide];
        scratch.gridIdx = d[b + VOXEL_FACE.gridIdx];
        scratch.isEdgeRail = false;
    }
}
function prepareWallChunkPropTextures(state, prop) {
    if (!prop.wallChunkProfileId || !state?.worldSurfaces) return;
    const textures = state.worldSurfaces.ensureWallChunkProfileTextures(state, prop.wallChunkProfileId, prop.wallChunkHeightPx);
    prop._wallChunkTextures = textures;
    prop._wallChunkTextureReady = !!textures.ready;
}
// Removed parallel sort (now in VisibleDrawQueue.js)
export function queryPropsInView(entityRegistry, viewport, spatialFrame, { tier = "props", hitTest = "circle", match = null, filterId = "overlay" } = {}) {
    return entityRegistry.queryView({ bounds: viewport.bounds(tier), kinds: ["worldProp"], filterId, match, hitTest }, spatialFrame);
}
export class WorldSceneRenderer {
    constructor() {
        this.visibleDrawQueue = new VisibleDrawQueue();
        this.wallFaceScratch = { wallHeight: 0, wallBaseZ: 0, wallCapHeight: 0, cacheObj: null, atlasFaceId: undefined, gridSide: 0, gridIdx: 0, isEdgeRail: false };
    }
    drawDebrisProps(ctx, state, viewport, options = {}) {
        const props = queryPropsInView(state.entityRegistry, viewport, state.spatialFrame, DEBRIS_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) this._drawProp(ctx, props[i], viewport);
    }
    drawFloorBelts(ctx, state, viewport) {
        drawFloorOccupancyBelts(ctx, state, viewport);
    }
    _appendVisible3dProps(state, viewport) {
        const props = queryPropsInView(state.entityRegistry, viewport, state.spatialFrame, THREE_D_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            const distSq = (p.x - viewport.x) ** 2 + (p.y - viewport.y) ** 2;
            this.visibleDrawQueue.push(DRAW_KIND_PROP, 0, p, distSq);
        }
    }
    _appendVisibleStaticGridWalls(state, viewport) {
        collectStaticGridWallDrawables(state.obstacleGrid, viewport, this.visibleDrawQueue);
        collectStaticGridEdgeRailDrawables(state.obstacleGrid, viewport, this.visibleDrawQueue);
    }
    draw3DBuildings(ctx, state, viewport, options = {}) {
        const q = this.visibleDrawQueue;
        const face = this.wallFaceScratch;
        q.clear();
        this._appendVisible3dProps(state, viewport);
        const skipWalls = options.skipWalls === true;
        const skipWallCaps = options.skipWallCaps === true;
        if (!skipWalls) this._appendVisibleStaticGridWalls(state, viewport);
        q.sort();
        const flatWallChunks = options.flatWallChunks === true;
        for (let i = 0; i < q.length; i++) {
            const kind = q.kinds[i];
            const baseIndex = q.baseIndices[i];
            const ref = q.refs[i];
            if (kind === DRAW_KIND_PROP) this._drawProp(ctx, ref, viewport, state, { flatWallChunks });
            else if (kind === DRAW_KIND_VOXEL) {
                bindWallFaceScratchFlat(face, DRAW_KIND_VOXEL, baseIndex);
                drawProjectedVoxelWallFaceFlat(ctx, baseIndex, viewport, state, face);
            } else if (kind === DRAW_KIND_RAIL) {
                bindWallFaceScratchFlat(face, DRAW_KIND_RAIL, baseIndex);
                drawProjectedGridEdgeRailFlat(ctx, baseIndex, viewport, state, face, skipWallCaps);
            }
        }
    }
    _drawProp(ctx, prop, viewport, state, options = {}) {
        const hasAlpha = prop.alpha !== undefined && prop.alpha !== 1;
        const prevAlpha = ctx.globalAlpha;
        if (hasAlpha) ctx.globalAlpha = prevAlpha * prop.alpha;
        try {
            const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
            const draw = propCatalog[renderKey]?.drawRecipe;
            if (!draw) return;
            prepareWallChunkPropTextures(state, prop);
            if (options.flatWallChunks && drawFlatWallChunkProp(ctx, prop)) return;
            drawCachedPropSprite(ctx, prop, viewport, renderKey, draw);
        } finally {
            if (hasAlpha) ctx.globalAlpha = prevAlpha;
        }
    }
}
const SHARED_HALF_EXTENTS = { x: 0, y: 0 };
const beltFilmstripDrawByTurn = { straight: createFlatConveyorDraw(), left: createFlatConveyorDraw({ turnDirection: "left" }), right: createFlatConveyorDraw({ turnDirection: "right" }) };
const BELT_FILMSTRIP_DRAW = new Array(16);
let beltFilmstripDrawReady = false;
function ensureBeltFilmstripDrawTable() {
    if (beltFilmstripDrawReady) return;
    for (let packed = 1; packed < 16; packed++) {
        if (!BeltPacked.isValid(packed)) continue;
        const turn = BeltPacked.turn(packed);
        BELT_FILMSTRIP_DRAW[packed] = turn === 0 ? beltFilmstripDrawByTurn.left : turn === 2 ? beltFilmstripDrawByTurn.right : beltFilmstripDrawByTurn.straight;
    }
    beltFilmstripDrawReady = true;
}
function beltDrawForPacked(packed) {
    ensureBeltFilmstripDrawTable();
    return BELT_FILMSTRIP_DRAW[packed];
}
export class FloorBeltDrawCache {
    constructor() {
        this.revision = -1;
        this.idx = new Uint32Array(0);
        this.count = 0;
        this.uniquePacked = new Uint8Array(12);
        this.uniqueCount = 0;
    }
    static clear(state) {
        if (!state.sandbox) return;
        state.sandbox.floorBeltDrawCache = null;
    }
    sync(state, grid, viewport = null) {
        if (!state.sandbox) return null;
        if (!state.sandbox.floorBeltDrawCache) state.sandbox.floorBeltDrawCache = new FloorBeltDrawCache();
        const cache = state.sandbox.floorBeltDrawCache;
        const revision = floorOccupancyStampDrawCacheKey(grid);
        if (cache.revision === revision) return cache;
        const cellHalf = grid.cellHalfSize;
        SHARED_HALF_EXTENTS.x = cellHalf;
        SHARED_HALF_EXTENTS.y = cellHalf;
        const size = grid.cols * grid.rows;
        let idxList = cache.idx.length >= grid.floorBeltCount ? cache.idx : new Uint32Array(Math.max(grid.floorBeltCount, 8));
        const packedSeen = new Uint8Array(16);
        let count = 0;
        let uniqueCount = 0;
        const uniquePacked = cache.uniquePacked;
        for (let cellIdx = 0; cellIdx < size; cellIdx++) {
            const packed = grid.floorPacked[cellIdx];
            if (!packed) continue;
            if (count >= idxList.length) {
                const grown = new Uint32Array(idxList.length * 2);
                grown.set(idxList.subarray(0, count));
                idxList = grown;
            }
            idxList[count++] = cellIdx;
            if (!packedSeen[packed]) {
                packedSeen[packed] = 1;
                uniquePacked[uniqueCount++] = packed;
            }
        }
        cache.revision = revision;
        cache.idx = idxList;
        cache.count = count;
        cache.uniqueCount = uniqueCount;
        if (viewport && uniqueCount)
            warmSharedGridStampFilmstripCache(viewport, cellHalf, GRID_STAMP_RENDER_KEY.FloorBelt, uniquePacked, uniqueCount, BeltPacked.flowAngle, beltDrawForPacked, BELT_FILMSTRIP_FRAMES);
        return cache;
    }
    draw(ctx, viewport, grid) {
        if (!this.count) return;
        const halfExtents = SHARED_HALF_EXTENTS;
        const cellHalf = grid.cellHalfSize;
        for (let i = 0; i < this.count; i++) {
            const cellIdx = this.idx[i];
            const x = grid.gridCenterXByIdx(cellIdx);
            const y = grid.gridCenterYByIdx(cellIdx);
            if (!viewport.circleInBounds(x, y, cellHalf, "props")) continue;
            const packed = grid.floorPacked[cellIdx];
            const frameIndex = Math.floor(grid._floorBeltAnimMs[cellIdx] / BELT_FRAME_MS) % BELT_FILMSTRIP_FRAMES;
            drawCachedGridStampFilmstripShared(
                ctx,
                x,
                y,
                halfExtents,
                viewport,
                GRID_STAMP_RENDER_KEY.FloorBelt,
                BeltPacked.stripKey(packed),
                BeltPacked.flowAngle(packed),
                beltDrawForPacked(packed),
                frameIndex,
                BELT_FILMSTRIP_FRAMES,
            );
        }
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (grid.floorBeltCount === 0) return;
    if (!state.sandbox) return;
    if (!state.sandbox.floorBeltDrawCache) state.sandbox.floorBeltDrawCache = new FloorBeltDrawCache();
    const cache = state.sandbox.floorBeltDrawCache.sync(state, grid, viewport);
    cache.draw(ctx, viewport, grid);
}
/** Default omnidirectional vision radius in grid tiles. */
export const LOS_SHADOW_VISION_TILES_DEFAULT = 16;
/** Viewer height above floor for shadow extrusion, in cell heights (ground-plane light). */
export const LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT = 1;
/** Alpha of the dark overlay outside vision. */
export const LOS_SHADOW_OVERLAY_ALPHA = 0.82;
const EDGE_STRIDE = 7;
export class EdgeList {
    constructor(initialCapacity = 64) {
        this.data = new Float32Array(initialCapacity * EDGE_STRIDE);
        this.length = 0;
    }
    clear() {
        this.length = 0;
    }
    add(x1, y1, x2, y2, nx, ny, wallTopZ) {
        const i = this.length;
        const base = i * EDGE_STRIDE;
        if (base + EDGE_STRIDE > this.data.length) {
            const next = new Float32Array(Math.max(this.data.length * 2, base + EDGE_STRIDE));
            next.set(this.data);
            this.data = next;
        }
        this.data[base] = x1;
        this.data[base + 1] = y1;
        this.data[base + 2] = x2;
        this.data[base + 3] = y2;
        this.data[base + 4] = nx;
        this.data[base + 5] = ny;
        this.data[base + 6] = wallTopZ;
        this.length++;
    }
}
export { EDGE_STRIDE };
const sEdgeSegmentAabb = createAabb();
function clampSegmentCoord(a, b, v) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return v < lo ? lo : v > hi ? hi : v;
}
export function edgeSegmentOutsideCircle(edge, centerX, centerY, rangeSq) {
    const segment = aabbFromTwoPointsInto(sEdgeSegmentAabb, edge.x1, edge.y1, edge.x2, edge.y2);
    return distanceSqToAabb(centerX, centerY, segment.minX, segment.minY, segment.maxX, segment.maxY) > rangeSq;
}
function edgeSegmentOutsideCircleFlat(data, base, centerX, centerY, rangeSq) {
    const segment = aabbFromTwoPointsInto(sEdgeSegmentAabb, data[base], data[base + 1], data[base + 2], data[base + 3]);
    return distanceSqToAabb(centerX, centerY, segment.minX, segment.minY, segment.maxX, segment.maxY) > rangeSq;
}
export function forEachLosShadowQuadInRange(edgeList, lightX, lightY, range, lightZ, viewport, quadScratch, emitQuad) {
    const rSq = range * range;
    const count = edgeList.length;
    const data = edgeList.data;
    for (let i = 0; i < count; i++) {
        const base = i * EDGE_STRIDE;
        if (edgeSegmentOutsideCircleFlat(data, base, lightX, lightY, rSq)) continue;
        const x1 = data[base];
        const y1 = data[base + 1];
        const x2 = data[base + 2];
        const y2 = data[base + 3];
        const wallTopZ = data[base + 6];
        const closestX = clampSegmentCoord(x1, x2, lightX);
        const closestY = clampSegmentCoord(y1, y2, lightY);
        const dx = lightX - closestX;
        const dy = lightY - closestY;
        if (dx * dx + dy * dy > rSq) continue;
        projectWallShadowQuadScreenInto(quadScratch, viewport, lightX, lightY, lightZ, x1, y1, x2, y2, wallTopZ, range * 2);
        emitQuad(quadScratch, 4);
    }
}
const sEdgeScratch = new EdgeList();
const sQuadScratch = new Float32Array(8);
const sLightQueryBounds = createAabb();
const sScreenLight = { x: 0, y: 0 };
let sOverlayCanvas = null;
let sOverlayCtx = null;
function ensureOverlayBuffer(width, height) {
    if (!sOverlayCanvas) {
        sOverlayCanvas = createOffscreenCanvas(width, height);
        sOverlayCtx = sOverlayCanvas.getContext("2d");
    }
    resizeOffscreenCanvas(sOverlayCanvas, width, height);
    return sOverlayCtx;
}
function resolveLightZ(obstacleGrid, options) {
    if (options.lightZ != null) return options.lightZ;
    const heightCells = options.lightHeightCells ?? LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT;
    return heightCells * obstacleGrid.cellSize;
}
export function composeLosShadowMask(overlayCtx, canvasW, canvasH, viewport, obstacleGrid, options = {}) {
    const visionTiles = options.visionTiles ?? LOS_SHADOW_VISION_TILES_DEFAULT;
    const lightZ = resolveLightZ(obstacleGrid, options);
    const overlayAlpha = options.overlayAlpha ?? LOS_SHADOW_OVERLAY_ALPHA;
    const lightX = viewport.x;
    const lightY = viewport.y;
    const range = visionTiles * obstacleGrid.cellSize;
    const screenRange = range * (viewport.zoom ?? 1);
    viewport.worldToScreenInto(sScreenLight, lightX, lightY);
    centerReachAabbInto(sLightQueryBounds, lightX, lightY, range);
    collectExposedWallEdgesInAabb(obstacleGrid, sLightQueryBounds, sEdgeScratch);
    collectRailWallShadowEdgesInAabb(obstacleGrid, sLightQueryBounds, sEdgeScratch);
    fillMaskBase(overlayCtx, canvasW, canvasH, `rgba(0,0,0,${overlayAlpha})`);
    cutOutRadialSoftDisc(overlayCtx, sScreenLight.x, sScreenLight.y, screenRange);
    addMaskPathFill(overlayCtx, `rgba(0,0,0,${overlayAlpha})`, (pathCtx) => {
        let hasShadows = false;
        forEachLosShadowQuadInRange(sEdgeScratch, lightX, lightY, range, lightZ, viewport, sQuadScratch, (flatVerts, vertCount) => {
            traceWoundFlatQuad(pathCtx, flatVerts, vertCount);
            hasShadows = true;
        });
        return hasShadows;
    });
}
export function drawLosShadowOverlay(ctx, viewport, obstacleGrid, options = {}) {
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    const overlayCtx = ensureOverlayBuffer(canvasW, canvasH);
    composeLosShadowMask(overlayCtx, canvasW, canvasH, viewport, obstacleGrid, options);
    blitMaskOverlay(ctx, sOverlayCanvas);
}
const sRailShadowBoxes = new StrideFloatList(RAIL_BOX_STRIDE);
function pushRailWallBoxCapShadowEdges(data, index, out) {
    const base = index * RAIL_BOX_STRIDE;
    const wallTopZ = data[base + RAIL_BOX.wallCapHeight];
    const inwardX = data[base + RAIL_BOX.inwardX];
    const inwardY = data[base + RAIL_BOX.inwardY];
    const innerP1x = data[base + RAIL_BOX.innerP1x];
    const innerP1y = data[base + RAIL_BOX.innerP1y];
    const innerP2x = data[base + RAIL_BOX.innerP2x];
    const innerP2y = data[base + RAIL_BOX.innerP2y];
    const outerP1x = data[base + RAIL_BOX.outerP1x];
    const outerP1y = data[base + RAIL_BOX.outerP1y];
    const outerP2x = data[base + RAIL_BOX.outerP2x];
    const outerP2y = data[base + RAIL_BOX.outerP2y];
    out.add(outerP1x, outerP1y, outerP2x, outerP2y, -inwardX, -inwardY, wallTopZ);
    out.add(innerP1x, innerP1y, innerP2x, innerP2y, inwardX, inwardY, wallTopZ);
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        out.add(outerP1x, outerP1y, innerP1x, innerP1y, -tx, -ty, wallTopZ);
        out.add(innerP2x, innerP2y, outerP2x, outerP2y, tx, ty, wallTopZ);
    }
}
export function collectRailWallShadowEdgesInAabb(grid, bounds, out) {
    collectRailWallBoxesInAabb(grid, bounds, sRailShadowBoxes);
    for (let i = 0; i < sRailShadowBoxes.length; i++) pushRailWallBoxCapShadowEdges(sRailShadowBoxes.data, i, out);
}
