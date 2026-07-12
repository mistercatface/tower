import { traceAabbRect, fillCircle, strokeSegment, traceSegment, fillStrokeCircle, strokeCircle, strokeOpenPolyline, traceClosedFlatPolygon, traceFlatQuad, fillRgbaBuffer, fillRgbaRect, strokeAxisLineRgba, createOffscreenCanvas, resizeOffscreenCanvas, OVERLAY_RENDER_KEY, drawCachedOverlayGlyph, drawCachedPropSprite, drawImageQuadFromFlatRingsWithBaseTransform, drawImageQuadWithBaseTransformScalars, drawImageTriangleWithBaseTransformScalars, blitMaskOverlay, addMaskPathFill, cutOutRadialSoftDisc, fillMaskBase, traceWoundFlatQuad, getCanvasLineScale, traceCircle } from "../Canvas/canvas.js";
import { isRailWallEdge, forEachCellEdge, gridNavCacheKey, resolveElevationAlpha, extrudeLocalVertsInto, isOutwardFaceTowardViewer, projectWorldPoint, projectWorldQuad, resolveSurfaceProfileId, SURFACE_MATERIAL_OWNER, cellInRect, floorOccupancyStampDrawCacheKey, projectWallShadowQuadScreen, collectExposedWallEdgesInAabbF32 } from "../Spatial/spatial.js";
import { quantizeAngleIndex, normalizeXYInto, lengthXY, flatQuadOverlapAabbF32, aabbFromTwoPointsF32, distanceSqToAabbF32, centerReachAabbF32 } from "../Math/math.js";
import { ENGINE_F32, ENGINE_U8, ENGINE_BOUNDS_BASE, B_TMP, M_OUT_NX, M_OUT_NY, M_OUT_LEN, M_OUT_VX, M_OUT_VY, M_OUT_VZ, S_OUT_XY, S_OUT_SCREEN, S_AABB, S_QUAD, R_QUAD_A, R_SUBDIV, R_CAP_CORNERS, R_CAP_UV, R_CAP_SRC, R_CHEVRON, R_FACE_BAND_BOT, R_FACE_BAND_TOP, R_FACE_VISIBLE, MAX_PRISM_FACES, wallFaceDrawMemoSlab, clearWallFaceDrawMemoSlab, viewBoundsBuf, VIEW_TIER_PROPS, VIEW_TIER_STRUCTURE, VIEW_TIER_CHUNKS } from "../../Core/engineMemory.js";
import { transformRollVertexInto, readEntityFacing } from "../Physics/physics.js";
import { resolveVisualOverrideColorTree } from "../Color/visualOverride.js";
import { shadeHex } from "../Color/colorMath.js";
import { PROP_RENDER_MODE_3D, DRAW_KIND_PROP, DRAW_KIND_VOXEL, DRAW_KIND_RAIL, PATH_OVERLAY_MODE_DIRECT, PATH_OVERLAY_MODE_FLOW, PATH_OVERLAY_MODE_HPA, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_DEBUG, OVERLAY_CMD_AABB, OVERLAY_CMD_CIRCLE_STROKE, OVERLAY_CMD_CIRCLE_FILL_STROKE, OVERLAY_CMD_SEGMENT, OVERLAY_CMD_POLYLINE, OVERLAY_CMD_ARROW_HEAD, OVERLAY_CMD_DIRECTION_ARROW, OVERLAY_CMD_AIM_SEGMENT, SHAPE_TYPE_CIRCLE, WALL_FACE_ATLAS_MISS, WALL_FACE_ATLAS_SOLID, WALL_FACE_SUBDIV_NONE } from "../../Core/engineEnums.js";
import { collectVoxelWallFacesInAabbFlatF32, VOXEL_FACE, VOXEL_FACE_STRIDE, collectRailWallBoxesInAabbF32, RAIL_BOX, RAIL_BOX_STRIDE, flatRailWallCapUvCornersIntoFlat, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { StrideFloatList } from "../World/StrideFloatList.js";
import { gameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import propCatalog from "../../Assets/props/index.js";
import { getSurfaceProfileRevision, SS_POINTS } from "../WorldSurface/worldSurface.js";
import { propShapeFootprintId } from "../Props/props.js";
let flatProjectedVerts = ENGINE_F32.subarray(R_QUAD_A, R_QUAD_A + 8);
const rQuadA = ENGINE_F32.subarray(R_QUAD_A, R_QUAD_A + 8);
const rSubdiv = ENGINE_F32.subarray(R_SUBDIV, R_SUBDIV + 8);
const rCapCorners = ENGINE_F32.subarray(R_CAP_CORNERS, R_CAP_CORNERS + 8);
const rCapUv = ENGINE_F32.subarray(R_CAP_UV, R_CAP_UV + 8);
const rCapSrc = ENGINE_F32.subarray(R_CAP_SRC, R_CAP_SRC + 8);
const rChevron = ENGINE_F32.subarray(R_CHEVRON, R_CHEVRON + 12);
const rFaceVisible = ENGINE_U8.subarray(R_FACE_VISIBLE, R_FACE_VISIBLE + MAX_PRISM_FACES);
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
        traceAabbRect(ctx, minX, minY, maxX, maxY);
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
export function overlayAabb(minX, minY, maxX, maxY, { fill, stroke, lineWidth = 1, dash } = {}) {
    return { kind: OVERLAY_CMD_AABB, minX, minY, maxX, maxY, fill, stroke, lineWidth, dash };
}
export function overlayGridCellHighlight(minX, minY, maxX, maxY, grid, tint, style) {
    const w = maxX - minX;
    const h = maxY - minY;
    const anchorX = (minX + maxX) * 0.5;
    const anchorY = (minY + maxY) * 0.5;
    const cmd = overlayAabb(minX, minY, maxX, maxY, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.GridCellHighlight, gridCellHighlightCacheKey(grid, tint), Math.max(w, h), anchorX, anchorY);
    return cmd;
}
export function overlayCircleStroke(cx, cy, r, { stroke, lineWidth = 1, dash }) {
    return { kind: OVERLAY_CMD_CIRCLE_STROKE, cx, cy, r, stroke, lineWidth, dash };
}
export function overlayCachedSelectionRing(cx, cy, r, style) {
    const cmd = overlayCircleStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.SelectionRing, selectionRingCacheKey(r), overlayGlyphSpan(r, style.lineWidth ?? 1, 4), cx, cy);
    return cmd;
}
export function overlayCircleFillStroke(cx, cy, r, { fill, stroke = "#fff", lineWidth = 1 }) {
    return { kind: OVERLAY_CMD_CIRCLE_FILL_STROKE, cx, cy, r, fill, stroke, lineWidth };
}
export function overlayCachedCircleFillStroke(cx, cy, r, style, renderKey, customKey, lineWidthForSpan = style.lineWidth ?? 1) {
    const cmd = overlayCircleFillStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(renderKey, customKey, overlayGlyphSpan(r, lineWidthForSpan), cx, cy);
    return cmd;
}
export function overlaySegment(x0, y0, x1, y1, { stroke, lineWidth = 1, dash, lineCap }) {
    return { kind: OVERLAY_CMD_SEGMENT, x0, y0, x1, y1, stroke, lineWidth, dash, lineCap };
}
export function overlayPolyline(points, { stroke, lineWidth = 1, dash }) {
    return { kind: OVERLAY_CMD_POLYLINE, points, stroke, lineWidth, dash };
}
export function overlayArrowHead(x, y, dirX, dirY, { fill, headLen = 9, headWidth = 6 }) {
    return { kind: OVERLAY_CMD_ARROW_HEAD, x, y, dirX, dirY, fill, headLen, headWidth };
}
export function overlayCachedArrowHead(x, y, dirX, dirY, { fill, headLen = 9, headWidth = 6 }) {
    const cmd = overlayArrowHead(x, y, dirX, dirY, { fill, headLen, headWidth });
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.PathArrowHead, pathArrowHeadCacheKey(dirX, dirY, fill, headLen, headWidth), overlayGlyphSpan(Math.max(headLen, headWidth), 1, 2), x, y);
    return cmd;
}
export function overlayCachedFlowDirectionArrow(cx, cy, dirX, dirY, { pad = 0, len = 20, stroke, lineWidth = 2, headLen = 9, headWidth = 6 }) {
    const cmd = { kind: OVERLAY_CMD_DIRECTION_ARROW, cx, cy, dirX, dirY, pad, len, stroke, lineWidth, headLen, headWidth };
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.FlowDirectionArrow, flowDirectionArrowCacheKey(dirX, dirY, pad, len, stroke, headLen, headWidth), pad + len + headLen + lineWidth + 4, cx, cy);
    return cmd;
}
export function appendOverlayWireLink(out, x0, y0, x1, y1, color, { lineWidth = 2, dash = [6, 4], endpointRadius = 3, live = false } = {}) {
    out.push(overlaySegment(x0, y0, x1, y1, { stroke: color, lineWidth, dash }));
    if (live) out.push(overlayCircleFillStroke(x1, y1, endpointRadius, { fill: color, stroke: color, lineWidth: 1 }));
    else out.push(overlayCachedCircleFillStroke(x1, y1, endpointRadius, { fill: color, stroke: color, lineWidth: 1 }, OVERLAY_RENDER_KEY.WireEndpoint, wireEndpointCacheKey(endpointRadius, color), 1));
}
export function overlayAimSegment(x1, y1, x2, y2, { color, lineWidth = 3, arrowhead = true, glow = true, glowHue = 180 } = {}) {
    return { kind: OVERLAY_CMD_AIM_SEGMENT, x1, y1, x2, y2, color, lineWidth, arrowhead, glow, glowHue };
}
function drawArrowHeadAt(ctx, tipX, tipY, dirX, dirY, fill, headLen, headWidth) {
    const tx = -dirY;
    const ty = dirX;
    const baseCenterX = tipX - dirX * headLen;
    const baseCenterY = tipY - dirY * headLen;
    rChevron[0] = tipX;
    rChevron[1] = tipY;
    rChevron[2] = baseCenterX + tx * headWidth;
    rChevron[3] = baseCenterY + ty * headWidth;
    rChevron[4] = baseCenterX - tx * headWidth;
    rChevron[5] = baseCenterY - ty * headWidth;
    ctx.fillStyle = fill;
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, rChevron, 3);
    ctx.fill();
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
    traceAabbRect(ctx, rect.minX, rect.minY, rect.maxX, rect.maxY);
    ctx.stroke();
    if (dash?.length) ctx.setLineDash([]);
}
export function bakeOverlayCommand(ctx, anchorX, anchorY, cmd) {
    if (cmd.kind === OVERLAY_CMD_CIRCLE_STROKE) {
        ctx.strokeStyle = cmd.stroke;
        ctx.lineWidth = cmd.lineWidth ?? 1;
        if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
        strokeCircle(ctx, anchorX, anchorY, cmd.r);
        if (cmd.dash?.length) ctx.setLineDash([]);
        return;
    }
    if (cmd.kind === OVERLAY_CMD_CIRCLE_FILL_STROKE) {
        ctx.fillStyle = cmd.fill;
        ctx.strokeStyle = cmd.stroke ?? "#fff";
        ctx.lineWidth = cmd.lineWidth ?? 1;
        fillStrokeCircle(ctx, anchorX, anchorY, cmd.r);
        return;
    }
    if (cmd.kind === OVERLAY_CMD_ARROW_HEAD) {
        drawArrowHeadAt(ctx, anchorX, anchorY, cmd.dirX, cmd.dirY, cmd.fill, cmd.headLen ?? 9, cmd.headWidth ?? 6);
        return;
    }
    if (cmd.kind === OVERLAY_CMD_DIRECTION_ARROW) {
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
    if (cmd.kind === OVERLAY_CMD_AABB) {
        const w = cmd.maxX - cmd.minX;
        const h = cmd.maxY - cmd.minY;
        const minX = anchorX - w * 0.5;
        const minY = anchorY - h * 0.5;
        drawAabbStyle(ctx, { minX, minY, maxX: minX + w, maxY: minY + h }, cmd);
    }
}
/** @typedef {Object} PathOverlayData
 * @property {number} mode
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
        normalizeXYInto(targetX - from.x, targetY - from.y);
        if (ENGINE_F32[M_OUT_LEN] > 0) {
            out.push(overlayCachedArrowHead(targetX, targetY, ENGINE_F32[M_OUT_NX], ENGINE_F32[M_OUT_NY], { fill: color }));
            return;
        }
    }
    if (pathNodes.length >= 2) {
        const n = pathNodes.length;
        const tip = pathNodes[n - 1];
        normalizeXYInto(tip.x - pathNodes[n - 2].x, tip.y - pathNodes[n - 2].y);
        if (ENGINE_F32[M_OUT_LEN] > 0) out.push(overlayCachedArrowHead(tip.x, tip.y, ENGINE_F32[M_OUT_NX], ENGINE_F32[M_OUT_NY], { fill: color }));
    }
}
function appendFlowAgentArrow(out, overlay) {
    const { propX, propY, propRadius, dirX, dirY, targetX, targetY } = overlay;
    if (dirX != null && dirY != null) {
        const color = "rgba(76, 175, 80, 0.85)";
        out.push(overlayCachedFlowDirectionArrow(propX, propY, dirX, dirY, { pad: propRadius + FLOW_ARROW_PAD, len: FLOW_ARROW_LEN, stroke: color, lineWidth: PATH_STROKE_WIDTH }));
        return;
    }
    if (targetX != null && targetY != null) out.push(overlayCachedCircleFillStroke(targetX, targetY, 4, { fill: "rgba(255, 193, 7, 0.85)" }, OVERLAY_RENDER_KEY.PathDestination, pathDestinationCacheKey(4, "rgba(255, 193, 7, 0.85)")));
}
function appendNormalPathOverlayCommands(out, overlay) {
    const { mode, targetX, targetY, pathNodes } = overlay;
    if (mode === PATH_OVERLAY_MODE_DIRECT) {
        if (pathNodes.length < 2) return;
        out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.55)", lineWidth: 1.5, dash: [4, 4] }));
        out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.85)", lineWidth: PATH_STROKE_WIDTH }));
        const end = pathNodes[pathNodes.length - 1];
        out.push(overlayCircleStroke(end.x, end.y, 4, { stroke: "rgba(0, 188, 212, 0.85)", lineWidth: PATH_STROKE_WIDTH }));
        return;
    }
    if (mode === PATH_OVERLAY_MODE_FLOW) {
        if (pathNodes && pathNodes.length) out.push(overlayPolyline(pathNodes, { stroke: "rgba(76, 175, 80, 0.65)", lineWidth: HPA_STROKE_WIDTH }));
        return;
    }
    if (pathNodes.length) out.push(overlayPolyline(pathNodes, { stroke: "rgba(156, 39, 176, 0.65)", lineWidth: HPA_STROKE_WIDTH }));
}
export function appendPathOverlayCommands(out, overlay, grid, visual = SANDBOX_PATH_VISUAL_DEBUG) {
    if (!overlay) return;
    if (visual === SANDBOX_PATH_VISUAL_NORMAL) {
        appendNormalPathOverlayCommands(out, overlay);
        return;
    }
    const { mode, pathNodes } = overlay;
    if (mode === PATH_OVERLAY_MODE_HPA) {
        if (pathNodes.length >= 2) out.push(overlayPolyline(pathNodes, { stroke: "#00e5ff", lineWidth: 4 }));
        for (let i = 0; i < pathNodes.length; i++) out.push(overlayCachedCircleFillStroke(pathNodes[i].x, pathNodes[i].y, 6, { fill: "#00e5ff" }, OVERLAY_RENDER_KEY.PathDebugNode, pathDestinationCacheKey(6, "#00e5ff")));
        return;
    }
    if (mode === PATH_OVERLAY_MODE_FLOW) {
        if (pathNodes && pathNodes.length >= 2) out.push(overlayPolyline(pathNodes, { stroke: "#4caf50", lineWidth: 4 }));
        if (pathNodes) for (let i = 0; i < pathNodes.length; i++) out.push(overlayCachedCircleFillStroke(pathNodes[i].x, pathNodes[i].y, 6, { fill: "#4caf50" }, OVERLAY_RENDER_KEY.PathDebugNode, pathDestinationCacheKey(6, "#4caf50")));
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
        normalizeXYInto(dx, dy);
        drawArrowHeadAt(ctx, x2, y2, ENGINE_F32[M_OUT_NX], ENGINE_F32[M_OUT_NY], color, 8, 5);
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
            } else if (cmd.kind === OVERLAY_CMD_CIRCLE_STROKE || cmd.kind === OVERLAY_CMD_CIRCLE_FILL_STROKE) {
                worldX = cmd.cx;
                worldY = cmd.cy;
            } else if (cmd.kind === OVERLAY_CMD_ARROW_HEAD) {
                worldX = cmd.x;
                worldY = cmd.y;
            } else if (cmd.kind === OVERLAY_CMD_DIRECTION_ARROW) {
                worldX = cmd.cx;
                worldY = cmd.cy;
            } else if (cmd.kind === OVERLAY_CMD_AABB) {
                worldX = (cmd.minX + cmd.maxX) * 0.5;
                worldY = (cmd.minY + cmd.maxY) * 0.5;
            }
            drawCachedOverlayGlyph(ctx, worldX, worldY, viewport, renderKey, customKey, worldSpan, (bakeCtx, bakeAnchorX, bakeAnchorY) => bakeOverlayCommand(bakeCtx, bakeAnchorX, bakeAnchorY, cmd));
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_AABB) {
            drawAabbCommand(ctx, cmd);
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_CIRCLE_STROKE) {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeCircle(ctx, cmd.cx, cmd.cy, cmd.r);
            if (cmd.dash?.length) ctx.setLineDash([]);
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_CIRCLE_FILL_STROKE) {
            ctx.fillStyle = cmd.fill;
            ctx.strokeStyle = cmd.stroke ?? "#fff";
            ctx.lineWidth = cmd.lineWidth ?? 1;
            fillStrokeCircle(ctx, cmd.cx, cmd.cy, cmd.r);
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_SEGMENT) {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.lineCap) ctx.lineCap = cmd.lineCap;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeSegment(ctx, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
            if (cmd.dash?.length) ctx.setLineDash([]);
            if (cmd.lineCap) ctx.lineCap = "butt";
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_POLYLINE) {
            ctx.strokeStyle = cmd.stroke;
            ctx.lineWidth = cmd.lineWidth ?? 1;
            if (cmd.dash?.length) ctx.setLineDash(cmd.dash);
            strokeOpenPolyline(ctx, cmd.points);
            if (cmd.dash?.length) ctx.setLineDash([]);
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_ARROW_HEAD) {
            drawArrowHeadAt(ctx, cmd.x, cmd.y, cmd.dirX, cmd.dirY, cmd.fill, cmd.headLen ?? 9, cmd.headWidth ?? 6);
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_DIRECTION_ARROW) {
            bakeOverlayCommand(ctx, cmd.cx, cmd.cy, cmd);
            continue;
        }
        if (cmd.kind === OVERLAY_CMD_AIM_SEGMENT) drawAimSegmentCommand(ctx, cmd);
    }
    ctx.restore();
}
function ensureFlatProjectedVertScratch(count) {
    if (flatProjectedVerts.length < count * 2) flatProjectedVerts = new Float32Array(count * 2);
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
let sSphereVertLx = new Float32Array(0);
let sSphereVertLy = new Float32Array(0);
let sSphereVertZ = new Float32Array(0);
let sSphereVertU = new Float32Array(0);
let sSphereVertV = new Float32Array(0);
let sSphereVertCount = 0;
let sSphereRowStart = new Int32Array(0);
let sSphereRowCount = new Int32Array(0);
let sSphereFaceI0 = new Int32Array(0);
let sSphereFaceI1 = new Int32Array(0);
let sSphereFaceI2 = new Int32Array(0);
let sSphereFacePanel = new Uint16Array(0);
let sSphereFaceDepth = new Float32Array(0);
let sSphereFaceCount = 0;
let sSphereBackOrder = new Int32Array(0);
let sSphereFrontOrder = new Int32Array(0);
function ensureSphereVertCapacity(count) {
    if (sSphereVertLx.length >= count) return;
    sSphereVertLx = new Float32Array(count);
    sSphereVertLy = new Float32Array(count);
    sSphereVertZ = new Float32Array(count);
    sSphereVertU = new Float32Array(count);
    sSphereVertV = new Float32Array(count);
}
function ensureSphereRowCapacity(rowCount) {
    if (sSphereRowStart.length >= rowCount) return;
    sSphereRowStart = new Int32Array(rowCount);
    sSphereRowCount = new Int32Array(rowCount);
}
function ensureSphereFaceCapacity(count) {
    if (sSphereFaceI0.length >= count) return;
    sSphereFaceI0 = new Int32Array(count);
    sSphereFaceI1 = new Int32Array(count);
    sSphereFaceI2 = new Int32Array(count);
    sSphereFacePanel = new Uint16Array(count);
    sSphereFaceDepth = new Float32Array(count);
    sSphereBackOrder = new Int32Array(count);
    sSphereFrontOrder = new Int32Array(count);
}
function pushSphereVert(lx, ly, z, u = 0, v = 0) {
    const i = sSphereVertCount++;
    sSphereVertLx[i] = lx;
    sSphereVertLy[i] = ly;
    sSphereVertZ[i] = z;
    sSphereVertU[i] = u;
    sSphereVertV[i] = v;
    return i;
}
function pushSphereFace(i0, i1, i2, panel) {
    const f = sSphereFaceCount++;
    sSphereFaceI0[f] = i0;
    sSphereFaceI1[f] = i1;
    sSphereFaceI2[f] = i2;
    sSphereFacePanel[f] = panel;
    sSphereFaceDepth[f] = (sSphereVertZ[i0] + sSphereVertZ[i1] + sSphereVertZ[i2]) / 3;
}
function isSphereFaceVisible(prop, viewport, i0, i1, i2) {
    const v0lx = sSphereVertLx[i0];
    const v0ly = sSphereVertLy[i0];
    const v0z = sSphereVertZ[i0];
    const v1lx = sSphereVertLx[i1];
    const v1ly = sSphereVertLy[i1];
    const v1z = sSphereVertZ[i1];
    const v2lx = sSphereVertLx[i2];
    const v2ly = sSphereVertLy[i2];
    const v2z = sSphereVertZ[i2];
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
function drawSphereFace(ctx, prop, viewport, i0, i1, i2, fill) {
    ensureFlatProjectedVertScratch(3);
    projectPropVertexScalarsInto(flatProjectedVerts, 0, prop, viewport, sSphereVertLx[i0], sSphereVertLy[i0], sSphereVertZ[i0]);
    projectPropVertexScalarsInto(flatProjectedVerts, 2, prop, viewport, sSphereVertLx[i1], sSphereVertLy[i1], sSphereVertZ[i1]);
    projectPropVertexScalarsInto(flatProjectedVerts, 4, prop, viewport, sSphereVertLx[i2], sSphereVertLy[i2], sSphereVertZ[i2]);
    ctx.fillStyle = fill;
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, flatProjectedVerts, 3);
    ctx.fill();
}
function drawSphereFaceTextured(ctx, prop, viewport, i0, i1, i2) {
    const canvas = wallChunkPipeline._wallChunkCapCanvas;
    if (!canvas) return;
    ensureFlatProjectedVertScratch(3);
    projectPropVertexScalarsInto(flatProjectedVerts, 0, prop, viewport, sSphereVertLx[i0], sSphereVertLy[i0], sSphereVertZ[i0]);
    projectPropVertexScalarsInto(flatProjectedVerts, 2, prop, viewport, sSphereVertLx[i1], sSphereVertLy[i1], sSphereVertZ[i1]);
    projectPropVertexScalarsInto(flatProjectedVerts, 4, prop, viewport, sSphereVertLx[i2], sSphereVertLy[i2], sSphereVertZ[i2]);
    let minX = flatProjectedVerts[0];
    let maxX = minX;
    let minY = flatProjectedVerts[1];
    let maxY = minY;
    for (let i = 2; i < 6; i += 2) {
        const x = flatProjectedVerts[i];
        const y = flatProjectedVerts[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const destW = maxX - minX;
    const destH = maxY - minY;
    if (destW <= 0 || destH <= 0) return;
    let u0 = sSphereVertU[i0];
    let u1 = sSphereVertU[i1];
    let u2 = sSphereVertU[i2];
    const v0 = sSphereVertV[i0];
    const v1 = sSphereVertV[i1];
    const v2 = sSphereVertV[i2];
    if (Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 0.5) {
        if (u0 < 0.5) u0 += 1;
        if (u1 < 0.5) u1 += 1;
        if (u2 < 0.5) u2 += 1;
    }
    const texW = canvas.width;
    const texH = canvas.height;
    const su0 = (u0 % 1) * texW;
    const su1 = (u1 % 1) * texW;
    const su2 = (u2 % 1) * texW;
    const sv0 = v0 * texH;
    const sv1 = v1 * texH;
    const sv2 = v2 * texH;
    let sx = Math.min(su0, su1, su2);
    let sy = Math.min(sv0, sv1, sv2);
    let sw = Math.max(su0, su1, su2) - sx;
    let sh = Math.max(sv0, sv1, sv2) - sy;
    if (sw < 1) sw = 1;
    if (sh < 1) sh = 1;
    sx = Math.max(0, Math.min(texW - 1, sx));
    sy = Math.max(0, Math.min(texH - 1, sy));
    if (sx + sw > texW) sw = texW - sx;
    if (sy + sh > texH) sh = texH - sy;
    if (sw <= 0 || sh <= 0) return;
    ctx.save();
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, flatProjectedVerts, 3);
    ctx.clip();
    ctx.drawImage(canvas, sx, sy, sw, sh, minX, minY, destW, destH);
    ctx.restore();
}
function sortSphereFaceOrder(order, count) {
    for (let i = 1; i < count; i++) {
        const key = order[i];
        const keyDepth = sSphereFaceDepth[key];
        let j = i - 1;
        while (j >= 0 && sSphereFaceDepth[order[j]] > keyDepth) {
            order[j + 1] = order[j];
            j--;
        }
        order[j + 1] = key;
    }
}
/**
 * Build lat/long sphere mesh resting on the ground, then apply roll orientation.
 * Writes into module grow-only typed columns; face count is sSphereFaceCount.
 */
export function buildSphereMesh(radius, latBands, lonBands, qw, qx, qy, qz) {
    const rowCount = latBands + 1;
    const maxVerts = 2 + latBands * lonBands;
    const maxFaces = latBands * lonBands * 2;
    ensureSphereVertCapacity(maxVerts);
    ensureSphereRowCapacity(rowCount);
    ensureSphereFaceCapacity(maxFaces);
    sSphereVertCount = 0;
    sSphereFaceCount = 0;
    for (let lat = 0; lat <= latBands; lat++) {
        const phi = (lat / latBands) * Math.PI;
        const v = lat / latBands;
        const rowStart = sSphereVertCount;
        if (Math.sin(phi) < 1e-6) {
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            const lx = radius * sinPhi;
            const ly = 0;
            const z = radius * (1 + cosPhi);
            transformRollVertexInto(lx, ly, z, radius, qw, qx, qy, qz);
            pushSphereVert(ENGINE_F32[M_OUT_VX], ENGINE_F32[M_OUT_VY], ENGINE_F32[M_OUT_VZ], 0.5, v);
        } else
            for (let lon = 0; lon < lonBands; lon++) {
                const theta = (lon / lonBands) * Math.PI * 2;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);
                const lx = radius * sinPhi * Math.cos(theta);
                const ly = radius * sinPhi * Math.sin(theta);
                const z = radius * (1 + cosPhi);
                transformRollVertexInto(lx, ly, z, radius, qw, qx, qy, qz);
                pushSphereVert(ENGINE_F32[M_OUT_VX], ENGINE_F32[M_OUT_VY], ENGINE_F32[M_OUT_VZ], lon / lonBands, v);
            }
        sSphereRowStart[lat] = rowStart;
        sSphereRowCount[lat] = sSphereVertCount - rowStart;
    }
    for (let lat = 0; lat < latBands; lat++) {
        const rowAStart = sSphereRowStart[lat];
        const rowBStart = sSphereRowStart[lat + 1];
        const rowACount = sSphereRowCount[lat];
        const rowBCount = sSphereRowCount[lat + 1];
        const northPole = rowACount === 1;
        const southPole = rowBCount === 1;
        if (northPole) {
            const apex = rowAStart;
            for (let lon = 0; lon < lonBands; lon++) {
                const ln = (lon + 1) % lonBands;
                pushSphereFace(apex, rowBStart + ln, rowBStart + lon, lon);
            }
            continue;
        }
        if (southPole) {
            const apex = rowBStart;
            for (let lon = 0; lon < lonBands; lon++) {
                const ln = (lon + 1) % lonBands;
                pushSphereFace(rowAStart + lon, rowAStart + ln, apex, lon);
            }
            continue;
        }
        for (let lon = 0; lon < lonBands; lon++) {
            const ln = (lon + 1) % lonBands;
            const v00 = rowAStart + lon;
            const v01 = rowAStart + ln;
            const v10 = rowBStart + lon;
            const v11 = rowBStart + ln;
            pushSphereFace(v00, v01, v11, lon);
            pushSphereFace(v00, v11, v10, lon);
        }
    }
    return sSphereFaceCount;
}
export function drawFlatSphereDisc(ctx, prop, radius, pendingFill) {
    if (wallChunkPipeline?._wallChunkReady && wallChunkPipeline._wallChunkCapCanvas && fillCapPathWithChunkTexture(ctx, prop.x, prop.y)) {
        traceCircle(ctx, prop.x, prop.y, radius);
        ctx.closePath();
        ctx.fill();
        return;
    }
    ctx.fillStyle = pendingFill;
    fillCircle(ctx, prop.x, prop.y, radius);
}
export function drawSphere(ctx, prop, viewport, options = {}) {
    const radius = prop.radius;
    const panelCount = Math.max(3, options.panelCount ?? 6);
    const latBands = Math.max(3, options.latBands ?? 5);
    const lonBands = panelCount;
    const pendingFill = options.pendingFill ?? SPHERE_PENDING_FILL;
    const textured = !!(wallChunkPipeline?._wallChunkReady && wallChunkPipeline._wallChunkCapCanvas);
    const qw = prop.rollQw ?? 1;
    const qx = prop.rollQx ?? 0;
    const qy = prop.rollQy ?? 0;
    const qz = prop.rollQz ?? 0;
    buildSphereMesh(radius, latBands, lonBands, qw, qx, qy, qz);
    let backN = 0;
    let frontN = 0;
    for (let f = 0; f < sSphereFaceCount; f++)
        if (isSphereFaceVisible(prop, viewport, sSphereFaceI0[f], sSphereFaceI1[f], sSphereFaceI2[f])) sSphereFrontOrder[frontN++] = f;
        else sSphereBackOrder[backN++] = f;
    sortSphereFaceOrder(sSphereBackOrder, backN);
    sortSphereFaceOrder(sSphereFrontOrder, frontN);
    const drawPass = (order, count) => {
        for (let i = 0; i < count; i++) {
            const f = order[i];
            if (textured) drawSphereFaceTextured(ctx, prop, viewport, sSphereFaceI0[f], sSphereFaceI1[f], sSphereFaceI2[f]);
            else drawSphereFace(ctx, prop, viewport, sSphereFaceI0[f], sSphereFaceI1[f], sSphereFaceI2[f], pendingFill);
        }
    };
    drawPass(sSphereBackOrder, backN);
    drawPass(sSphereFrontOrder, frontN);
}
export const DEFAULT_PROP_HEIGHT = 14;
export const SPHERE_PENDING_FILL = "#9A9A9A";
export const WALL_CHUNK_FALLBACK_COLORS = { side: "#9E9E9E", sideShadow: "#757575", top: "#BDBDBD", bodyInspect: "#9E9E9E" };
let wallChunkPipeline = null;
export function bindWallChunkTexturePipeline(worldSurfaces) {
    wallChunkPipeline = worldSurfaces;
}
let sBaseRing = new Float32Array(0);
let sTopRing = new Float32Array(0);
function ensurePrismScratch(vertexCount) {
    if (vertexCount > MAX_PRISM_FACES) throw new Error(`ensurePrismScratch: ${vertexCount} faces exceeds MAX_PRISM_FACES (${MAX_PRISM_FACES})`);
    const ringLen = vertexCount * 2;
    if (sBaseRing.length < ringLen) {
        sBaseRing = new Float32Array(ringLen);
        sTopRing = new Float32Array(ringLen);
    }
}
function irFaceVisible(viewport, originX, originY, edgeMidX, edgeMidY) {
    return isOutwardFaceTowardViewer(edgeMidX, edgeMidY, edgeMidX - originX, edgeMidY - originY, viewport.x, viewport.y);
}
function drawSideFaceFlat(ctx, edgeIndex, count, shadow, mid, highlight) {
    const ai = edgeIndex * 2;
    const bi = ((edgeIndex + 1) % count) * 2;
    const topMidX = (sTopRing[ai] + sTopRing[bi]) * 0.5;
    const topMidY = (sTopRing[ai + 1] + sTopRing[bi + 1]) * 0.5;
    const baseMidX = (sBaseRing[ai] + sBaseRing[bi]) * 0.5;
    const baseMidY = (sBaseRing[ai + 1] + sBaseRing[bi + 1]) * 0.5;
    const bevel = ctx.createLinearGradient(topMidX, topMidY, baseMidX, baseMidY);
    bevel.addColorStop(0.0, highlight ?? mid);
    bevel.addColorStop(0.45, mid);
    bevel.addColorStop(1.0, shadow);
    ctx.fillStyle = bevel;
    ctx.beginPath();
    traceFlatQuad(ctx, sTopRing[ai], sTopRing[ai + 1], sTopRing[bi], sTopRing[bi + 1], sBaseRing[bi], sBaseRing[bi + 1], sBaseRing[ai], sBaseRing[ai + 1]);
    ctx.fill();
}
function classifyPrismFaces(count, viewport, cx, cy) {
    for (let i = 0; i < count; i++) {
        const ai = i * 2;
        const bi = ((i + 1) % count) * 2;
        const edgeMidX = (sBaseRing[ai] + sBaseRing[bi]) * 0.5;
        const edgeMidY = (sBaseRing[ai + 1] + sBaseRing[bi + 1]) * 0.5;
        rFaceVisible[i] = irFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY) ? 1 : 0;
    }
}
function fillCapPathWithChunkTexture(ctx, originX, originY) {
    const ws = wallChunkPipeline;
    const canvas = ws._wallChunkCapCanvas;
    if (!canvas) return false;
    const pattern = typeof ctx.createPattern === "function" ? ctx.createPattern(canvas, "repeat") : null;
    if (!pattern) return false;
    const settings = ws.settings;
    const textureScale = settings.surfaceBakeScale;
    const offset = (settings.cellSize * settings.cellsPerChunk) / 2;
    const inv = 1 / textureScale;
    if (typeof pattern.setTransform === "function") pattern.setTransform({ a: inv, b: 0, c: 0, d: inv, e: originX - offset * inv, f: originY - offset * inv });
    ctx.fillStyle = pattern;
    ctx.beginPath();
    return true;
}
function drawTexturedPrism(ctx, prop, localVerts, count, height, facing, alpha) {
    const ws = wallChunkPipeline;
    const textureScale = ws.settings.surfaceBakeScale;
    const sideCanvas = ws._wallChunkSideCanvas;
    const sideSrcHeight = (prop.wallChunkHeightPx ?? height) * textureScale;
    for (let pass = 0; pass < 2; pass++) {
        const wantFront = pass === 1;
        for (let i = 0; i < count; i++) {
            if ((rFaceVisible[i] === 1) !== wantFront) continue;
            const ai = i * 2;
            const bi = ((i + 1) % count) * 2;
            ctx.save();
            ctx.beginPath();
            traceFlatQuad(ctx, sTopRing[ai], sTopRing[ai + 1], sTopRing[bi], sTopRing[bi + 1], sBaseRing[bi], sBaseRing[bi + 1], sBaseRing[ai], sBaseRing[ai + 1]);
            ctx.clip();
            const baseTransform = ctx.getTransform();
            drawImageQuadFromFlatRingsWithBaseTransform(ctx, sideCanvas, 0, 0, sideCanvas.width, sideSrcHeight, sBaseRing, sTopRing, i, count, baseTransform.a, baseTransform.b, baseTransform.c, baseTransform.d, baseTransform.e, baseTransform.f);
            ctx.restore();
        }
    }
    let originX = 0;
    let originY = 0;
    for (let i = 0; i < count; i++) {
        originX += sTopRing[i * 2];
        originY += sTopRing[i * 2 + 1];
    }
    originX /= count;
    originY /= count;
    if (fillCapPathWithChunkTexture(ctx, originX, originY)) {
        ctx.beginPath();
        traceClosedFlatPolygon(ctx, sTopRing, count);
        ctx.fill();
    }
}
function drawExtrudedPrism(ctx, prop, viewport, localVerts, opts) {
    const height = opts.height ?? DEFAULT_PROP_HEIGHT;
    const facing = opts.facing ?? readEntityFacing(prop);
    const faceColors = opts.faceColors;
    const backFaceColors = opts.backFaceColors ?? null;
    const topColors = opts.topColors;
    const count = localVerts.length / 2;
    if (count < 3) return;
    ensurePrismScratch(count);
    const cx = prop.x;
    const cy = prop.y;
    const alpha = resolveElevationAlpha(height, viewport);
    projectWorldPoint(ENGINE_F32, S_OUT_XY, cx, cy, height, viewport);
    const topX = ENGINE_F32[S_OUT_XY];
    const topY = ENGINE_F32[S_OUT_XY + 1];
    extrudeLocalVertsInto(sBaseRing, sTopRing, localVerts, cx, cy, topX, topY, alpha, facing);
    classifyPrismFaces(count, viewport, cx, cy);
    const backShadow = backFaceColors ? backFaceColors.shadow : faceColors.shadow;
    const backMid = backFaceColors ? backFaceColors.mid : faceColors.shadow;
    const backHighlight = backFaceColors ? backFaceColors.highlight : faceColors.mid;
    ctx.fillStyle = faceColors.shadow;
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sBaseRing, count);
    ctx.fill();
    for (let pass = 0; pass < 2; pass++) {
        const wantFront = pass === 1;
        for (let i = 0; i < count; i++) {
            if ((rFaceVisible[i] === 1) !== wantFront) continue;
            const shadow = wantFront ? faceColors.shadow : backShadow;
            const mid = wantFront ? faceColors.mid : backMid;
            const highlight = wantFront ? faceColors.highlight : backHighlight;
            drawSideFaceFlat(ctx, i, count, shadow, mid, highlight);
        }
    }
    ctx.fillStyle = topColors.mid;
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sTopRing, count);
    ctx.fill();
}
const sPrismOpts = { height: DEFAULT_PROP_HEIGHT, facing: 0, faceColors: null, backFaceColors: null, topColors: null, topHx: null, topHy: null };
function fillPrismOptsFromDraw(opts, prop) {
    sPrismOpts.height = opts.height ?? DEFAULT_PROP_HEIGHT;
    sPrismOpts.facing = opts.facing ?? readEntityFacing(prop);
    sPrismOpts.faceColors = opts.faceColors;
    sPrismOpts.backFaceColors = opts.backFaceColors ?? null;
    sPrismOpts.topColors = opts.topColors;
    sPrismOpts.topHx = opts.topHx ?? null;
    sPrismOpts.topHy = opts.topHy ?? null;
    return sPrismOpts;
}
function scalePrismTopExtents(viewport) {
    if (sPrismOpts.topHx == null || sPrismOpts.topHy == null) return;
    const alpha = resolveElevationAlpha(sPrismOpts.height, viewport);
    sPrismOpts.topHx = sPrismOpts.topHx * (1 + alpha);
    sPrismOpts.topHy = sPrismOpts.topHy * (1 + alpha);
}
export function drawExtrudedConvexPolygon(ctx, prop, viewport, opts) {
    fillPrismOptsFromDraw(opts, prop);
    scalePrismTopExtents(viewport);
    drawExtrudedPrism(ctx, prop, viewport, opts.localVerts, sPrismOpts);
}
export function drawWallChunkTextured(ctx, prop, viewport, localVerts) {
    if (!wallChunkPipeline?._wallChunkReady) return false;
    const count = localVerts.length / 2;
    if (count < 3) return false;
    const height = prop.height ?? DEFAULT_PROP_HEIGHT;
    const facing = readEntityFacing(prop);
    ensurePrismScratch(count);
    const cx = prop.x;
    const cy = prop.y;
    const alpha = resolveElevationAlpha(height, viewport);
    projectWorldPoint(ENGINE_F32, S_OUT_XY, cx, cy, height, viewport);
    const topX = ENGINE_F32[S_OUT_XY];
    const topY = ENGINE_F32[S_OUT_XY + 1];
    extrudeLocalVertsInto(sBaseRing, sTopRing, localVerts, cx, cy, topX, topY, alpha, facing);
    classifyPrismFaces(count, viewport, cx, cy);
    drawTexturedPrism(ctx, prop, localVerts, count, height, facing, alpha);
    return true;
}
export function getWallChunkSpriteCacheKey(prop) {
    if (!prop.wallChunkProfileId) return "";
    const profileId = prop.wallChunkProfileId;
    const rev = getSurfaceProfileRevision(profileId);
    const readyBucket = prop._wallChunkTextureReady ? "ready" : "pending";
    return `wallchunk:${profileId}:${prop.wallChunkHeightPx}:${rev}:${readyBucket}:${propShapeFootprintId(prop)}`;
}
export function drawFlatWallChunkCap(ctx, prop, localVerts, facing = readEntityFacing(prop)) {
    if (!wallChunkPipeline?._wallChunkReady) return false;
    const count = localVerts.length / 2;
    if (count < 3) return false;
    ensurePrismScratch(count);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const px = prop.x;
    const py = prop.y;
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        sTopRing[i * 2] = px + lx * cos - ly * sin;
        sTopRing[i * 2 + 1] = py + lx * sin + ly * cos;
    }
    if (!fillCapPathWithChunkTexture(ctx, px, py)) return false;
    traceClosedFlatPolygon(ctx, sTopRing, count);
    ctx.fill();
    return true;
}
const sWallFaceColors = { shadow: null, mid: null, highlight: null };
const sWallBackFaceColors = { shadow: null, mid: null, highlight: null };
const sWallTopColors = { light: null, mid: null, dark: null };
const sWallDrawOpts = { height: 0, facing: 0, faceColors: sWallFaceColors, backFaceColors: sWallBackFaceColors, topColors: sWallTopColors, localVerts: null, topHx: null, topHy: null };
const sWallFlatVerts = new Float32Array(1024);
function drawWallChunkContour(ctx, prop, viewport, flatPresentation, localVerts, colors) {
    if (!localVerts || localVerts.length < 6) return;
    if (flatPresentation) {
        if (wallChunkPipeline?._wallChunkReady && wallChunkPipeline._wallChunkCapCanvas && drawFlatWallChunkCap(ctx, prop, localVerts)) return;
        const tinted = resolveVisualOverrideColorTree(prop, colors);
        const facing = readEntityFacing(prop);
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const count = localVerts.length / 2;
        if (count * 2 > sWallFlatVerts.length) throw new Error("flat wall chunk exceeds scratch capacity");
        const px = prop.x;
        const py = prop.y;
        for (let i = 0; i < count; i++) {
            const lx = localVerts[i * 2];
            const ly = localVerts[i * 2 + 1];
            sWallFlatVerts[i * 2] = px + lx * cos - ly * sin;
            sWallFlatVerts[i * 2 + 1] = py + lx * sin + ly * cos;
        }
        ctx.beginPath();
        traceClosedFlatPolygon(ctx, sWallFlatVerts, count);
        ctx.fillStyle = tinted.top ?? tinted.side;
        ctx.fill();
        return;
    }
    if (drawWallChunkTextured(ctx, prop, viewport, localVerts)) return;
    const tinted = resolveVisualOverrideColorTree(prop, colors);
    const height = prop.height ?? DEFAULT_PROP_HEIGHT;
    const side = tinted.side;
    const sideShadow = tinted.sideShadow ?? side;
    sWallFaceColors.shadow = sideShadow;
    sWallFaceColors.mid = side;
    sWallFaceColors.highlight = shadeHex(side, -0.12);
    sWallBackFaceColors.shadow = sideShadow;
    sWallBackFaceColors.mid = sideShadow;
    sWallBackFaceColors.highlight = side;
    sWallTopColors.light = tinted.top;
    sWallTopColors.mid = tinted.top;
    sWallTopColors.dark = tinted.top;
    sWallDrawOpts.height = height;
    sWallDrawOpts.facing = readEntityFacing(prop);
    sWallDrawOpts.localVerts = localVerts;
    sWallDrawOpts.topHx = null;
    sWallDrawOpts.topHy = null;
    drawExtrudedConvexPolygon(ctx, prop, viewport, sWallDrawOpts);
}
export function createWallChunkDraw() {
    return (ctx, prop, viewport, flatPresentation) => {
        const outline = prop.drawOutline;
        if (outline) {
            drawWallChunkContour(ctx, prop, viewport, flatPresentation, outline, WALL_CHUNK_FALLBACK_COLORS);
            return;
        }
        const parts = prop.collisionParts;
        if (parts?.length > 1) {
            for (let i = 0; i < parts.length; i++) {
                const verts = parts[i].vertices;
                if (verts?.length >= 6) drawWallChunkContour(ctx, prop, viewport, flatPresentation, verts, WALL_CHUNK_FALLBACK_COLORS);
            }
            return;
        }
        drawWallChunkContour(ctx, prop, viewport, flatPresentation, prop.shape?.vertices, WALL_CHUNK_FALLBACK_COLORS);
    };
}
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
export function wallGridDrawCacheHitF32(cache, grid, wallGridRevision, buf, o) {
    return cache.grid === grid && cache.wallGridRevision === wallGridRevision && cache.gridCols === grid.cols && cache.gridRows === grid.rows && cache.boundsMinX === buf[o] && cache.boundsMinY === buf[o + 1] && cache.boundsMaxX === buf[o + 2] && cache.boundsMaxY === buf[o + 3];
}
export function storeWallGridDrawCacheF32(cache, grid, wallGridRevision, buf, o) {
    cache.grid = grid;
    cache.wallGridRevision = wallGridRevision;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = buf[o];
    cache.boundsMinY = buf[o + 1];
    cache.boundsMaxX = buf[o + 2];
    cache.boundsMaxY = buf[o + 3];
}
export function collectStaticGridWallDrawables(obstacleGrid, viewport, outQueue) {
    const buf = viewBoundsBuf;
    const o = VIEW_TIER_STRUCTURE;
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHitF32(sGeomCache, obstacleGrid, wallGridRevision, buf, o)) {
        collectVoxelWallFacesInAabbFlatF32(obstacleGrid, buf, o, sGeomCache.faces);
        storeWallGridDrawCacheF32(sGeomCache, obstacleGrid, wallGridRevision, buf, o);
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
    const buf = viewBoundsBuf;
    const o = VIEW_TIER_STRUCTURE;
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHitF32(sBoxCache, obstacleGrid, wallGridRevision, buf, o)) {
        collectRailWallBoxesInAabbF32(obstacleGrid, buf, o, sBoxCache.boxes);
        storeWallGridDrawCacheF32(sBoxCache, obstacleGrid, wallGridRevision, buf, o);
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
 * Vertical bands: projectWorldPoint. Horizontal caps: box top ring + per-corner chunk UV.
 */
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
function wallDrawMemoSlot(face) {
    return (face.gridIdx * 4 + face.gridSide) * 5 + wallFaceKindIndex(face.atlasFaceId);
}
function syncWallFaceDrawMemoRevision(grid) {
    const slab = wallFaceDrawMemoSlab;
    if (slab.wallRev === grid.wallGridRevision && slab.surfRev === grid.surfaceMaterialRevision) return;
    clearWallFaceDrawMemoSlab(slab);
    slab.wallRev = grid.wallGridRevision;
    slab.surfRev = grid.surfaceMaterialRevision;
}
function wallFaceMemoHashIndex(memoKey) {
    return (Math.imul(memoKey ^ (memoKey >>> 16), 0x9e3779b1) >>> 0) & (wallFaceDrawMemoSlab.hashCap - 1);
}
function wallFaceMemoFindRow(memoKey) {
    const slab = wallFaceDrawMemoSlab;
    let idx = wallFaceMemoHashIndex(memoKey);
    const cap = slab.hashCap;
    for (let probe = 0; probe < cap; probe++) {
        const at = slab.hashTable[idx];
        if (at === -1) return -1;
        if (slab.memoKey[at] === memoKey) return at;
        idx = (idx + 1) & (cap - 1);
    }
    return -1;
}
function wallFaceMemoAllocRow(memoKey) {
    const slab = wallFaceDrawMemoSlab;
    if (slab.freeCount <= 0) clearWallFaceDrawMemoSlab(slab);
    const row = slab.freeSlots[--slab.freeCount];
    slab.memoKey[row] = memoKey;
    slab.camKey[row] = -1;
    slab.perspKey[row] = -1;
    slab.subdivX[row] = 0;
    slab.subdivY[row] = 0;
    slab.handles[row] = null;
    let idx = wallFaceMemoHashIndex(memoKey);
    const cap = slab.hashCap;
    for (let probe = 0; probe < cap; probe++) {
        if (slab.hashTable[idx] < 0) {
            slab.hashTable[idx] = row;
            slab.liveCount++;
            return row;
        }
        idx = (idx + 1) & (cap - 1);
    }
    throw new Error("wallFaceMemoAllocRow: hash table full");
}
function wallFaceMemoGetOrAlloc(memoKey) {
    const existing = wallFaceMemoFindRow(memoKey);
    if (existing >= 0) return existing;
    return wallFaceMemoAllocRow(memoKey);
}
export function appendProjectedFaceBand(ctx, botBuf, botO, topBuf, topO) {
    traceFlatQuad(ctx, botBuf[botO], botBuf[botO + 1], topBuf[topO], topBuf[topO + 1], topBuf[topO + 2], topBuf[topO + 3], botBuf[botO + 2], botBuf[botO + 3]);
}
export function traceProjectedFaceBand(ctx, botBuf, botO, topBuf, topO) {
    ctx.beginPath();
    appendProjectedFaceBand(ctx, botBuf, botO, topBuf, topO);
}
export function projectWallFaceBandInto(buf, o, x1, y1, x2, y2, z, viewport) {
    const alpha = resolveElevationAlpha(z, viewport);
    if (alpha <= 0) {
        buf[o] = x1;
        buf[o + 1] = y1;
        buf[o + 2] = x2;
        buf[o + 3] = y2;
    } else {
        buf[o] = x1 + (x1 - viewport.x) * alpha;
        buf[o + 1] = y1 + (y1 - viewport.y) * alpha;
        buf[o + 2] = x2 + (x2 - viewport.x) * alpha;
        buf[o + 3] = y2 + (y2 - viewport.y) * alpha;
    }
}
function computeFaceCornerElevatedInto(out8, offset, u, v, botBuf, botO, topBuf, topO) {
    const bot1X = botBuf[botO];
    const bot1Y = botBuf[botO + 1];
    const bot2X = botBuf[botO + 2];
    const bot2Y = botBuf[botO + 3];
    const top1X = topBuf[topO];
    const top1Y = topBuf[topO + 1];
    const top2X = topBuf[topO + 2];
    const top2Y = topBuf[topO + 3];
    const bx = bot1X + (bot2X - bot1X) * u;
    const by = bot1Y + (bot2Y - bot1Y) * u;
    const tx = top1X + (top2X - top1X) * u;
    const ty = top1Y + (top2Y - top1Y) * u;
    out8[offset] = bx + (tx - bx) * v;
    out8[offset + 1] = by + (ty - by) * v;
}
function hashSurfaceProfileId(profileId) {
    let h = 2166136261;
    for (let i = 0; i < profileId.length; i++) {
        h ^= profileId.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h | 0;
}
function resolveWallFaceAtlasScalars(x1, y1, x2, y2, state, face) {
    const worldSurfaces = state.worldSurfaces;
    const { wallHeight, wallBaseZ, wallCapHeight, cacheObj } = face;
    const settings = worldSurfaces.settings;
    const profileId = resolveSurfaceProfileId(state.obstacleGrid, SURFACE_MATERIAL_OWNER.WallFace, worldSurfaces.activeSurfaceProfileId, settings.cellsPerChunk, 0, 0, 0, face);
    const seed = worldSurfaces.worldSurfaceSeed;
    const wallHeightKey = resolveWallCapHeightPx(wallCapHeight, settings);
    const canUseSideCache = cacheObj && worldSurfaces.cacheKeys && worldSurfaces.surfaceSpace && worldSurfaces.worldSurfaceSeed !== undefined;
    let row = WALL_FACE_ATLAS_MISS;
    if (canUseSideCache) {
        syncWallFaceDrawMemoRevision(state.obstacleGrid);
        row = wallFaceMemoGetOrAlloc(wallDrawMemoSlot(face));
    }
    const slab = wallFaceDrawMemoSlab;
    let canvases = null;
    let cacheHit = false;
    let rev = 0;
    let profileHash = 0;
    if (canUseSideCache && row >= 0) {
        const space = worldSurfaces.surfaceSpace;
        space.writeWallAtlasWrap(x1, y1, x2, y2);
        const key = worldSurfaces.cacheKeys.wallAtlasCacheKey(seed, profileId, wallHeightKey);
        rev = getSurfaceProfileRevision(profileId);
        profileHash = hashSurfaceProfileId(profileId);
        canvases = slab.handles[row];
        if (canvases && slab.atlasRev[row] === rev && slab.atlasSeed[row] === seed && slab.atlasWallHeightKey[row] === wallHeightKey && slab.atlasProfileHash[row] === profileHash && worldSurfaces.surfaceCache.get(key) === canvases) cacheHit = true;
    }
    if (!cacheHit) {
        canvases = worldSurfaces.getOrEnsureWallAtlasScalars(x1, y1, x2, y2, profileId, wallCapHeight);
        if (!canvases) return WALL_FACE_ATLAS_MISS;
        if (canUseSideCache && row >= 0) {
            const space = worldSurfaces.surfaceSpace;
            const b = space._boundsBank;
            const o = SS_POINTS;
            slab.handles[row] = canvases;
            slab.atlasWx1[row] = b[o];
            slab.atlasWy1[row] = b[o + 1];
            slab.atlasWx2[row] = b[o + 2];
            slab.atlasWy2[row] = b[o + 3];
            slab.atlasRev[row] = rev;
            slab.atlasSeed[row] = seed;
            slab.atlasWallHeightKey[row] = wallHeightKey;
            slab.atlasProfileHash[row] = profileHash;
        }
    }
    const canvas = canvases[0];
    if (!canvas || canvas.isPlaceholder) return WALL_FACE_ATLAS_SOLID;
    if (row < 0) {
        syncWallFaceDrawMemoRevision(state.obstacleGrid);
        row = wallFaceMemoGetOrAlloc(wallDrawMemoSlot(face));
        const space = worldSurfaces.surfaceSpace;
        const b = space._boundsBank;
        const o = SS_POINTS;
        rev = getSurfaceProfileRevision(profileId);
        profileHash = hashSurfaceProfileId(profileId);
        slab.handles[row] = canvases;
        slab.atlasWx1[row] = b[o];
        slab.atlasWy1[row] = b[o + 1];
        slab.atlasWx2[row] = b[o + 2];
        slab.atlasWy2[row] = b[o + 3];
        slab.atlasRev[row] = rev;
        slab.atlasSeed[row] = seed;
        slab.atlasWallHeightKey[row] = wallHeightKey;
        slab.atlasProfileHash[row] = profileHash;
    }
    slab.capHeight[row] = wallCapHeight;
    slab.bandHeight[row] = wallHeight;
    slab.wallBaseZ[row] = wallBaseZ;
    slab.edgeLen[row] = Math.hypot(x2 - x1, y2 - y1);
    slab.wallCx[row] = (x1 + x2) * 0.5;
    slab.wallCy[row] = (y1 + y2) * 0.5;
    return row;
}
function computeWallFaceSubdivInto(row, settings, viewport) {
    const slab = wallFaceDrawMemoSlab;
    const cellSize = settings.cellSize;
    const bandHeight = slab.bandHeight[row];
    const wallBaseZ = slab.wallBaseZ[row];
    const topZ = Math.min(wallBaseZ + bandHeight, viewport.cameraHeight - 1);
    const alphaBandMax = resolveElevationAlpha(topZ, viewport);
    const alphaBase = resolveElevationAlpha(wallBaseZ, viewport);
    if (alphaBandMax <= alphaBase) {
        slab.subdivX[row] = 0;
        slab.subdivY[row] = 0;
        return WALL_FACE_SUBDIV_NONE;
    }
    const dist = Math.hypot(slab.wallCx[row] - viewport.x, slab.wallCy[row] - viewport.y);
    const subdivScale = Math.max(0.05, Math.min(1.0, 1.0 - (dist - settings.wallSubdivNearPx) / settings.wallSubdivFarPx));
    const visibleHeightCells = bandHeight / cellSize;
    slab.subdivX[row] = Math.max(1, Math.min(2, Math.ceil((slab.edgeLen[row] / cellSize) * subdivScale)));
    slab.subdivY[row] = Math.max(1, Math.ceil(visibleHeightCells * subdivScale));
    slab.capPx[row] = slab.capHeight[row] * settings.surfaceBakeScale;
    slab.alphaBase[row] = alphaBase;
    slab.alphaBandMax[row] = alphaBandMax;
    return row;
}
function blitWallFaceSubdiv(ctx, botBuf, botO, topBuf, topO, row, viewport) {
    const slab = wallFaceDrawMemoSlab;
    const canvas = slab.handles[row][0];
    const capHeight = slab.capHeight[row];
    const bandHeight = slab.bandHeight[row];
    const wallBaseZ = slab.wallBaseZ[row];
    const subdivX = slab.subdivX[row];
    const subdivY = slab.subdivY[row];
    const capPx = slab.capPx[row];
    const alphaBase = slab.alphaBase[row];
    const alphaBandMax = slab.alphaBandMax[row];
    const baseTransform = ctx.getTransform();
    const alphaSpan = alphaBandMax - alphaBase;
    const rowStep = bandHeight / subdivY;
    const cameraHeight = viewport.cameraHeight;
    const visibleRows = Math.min(subdivY, Math.ceil((cameraHeight - wallBaseZ) / rowStep));
    for (let r = 0; r < visibleRows; r++) {
        const bottomZ = wallBaseZ + r * rowStep;
        let topZ = wallBaseZ + (r + 1) * rowStep;
        if (bottomZ >= cameraHeight) break;
        if (topZ >= cameraHeight) topZ = cameraHeight - 1;
        const v0 = (resolveElevationAlpha(bottomZ, viewport) - alphaBase) / alphaSpan;
        const v1 = (resolveElevationAlpha(topZ, viewport) - alphaBase) / alphaSpan;
        const sy0 = (bottomZ / capHeight) * capPx;
        const sy1 = (topZ / capHeight) * capPx;
        for (let col = 0; col < subdivX; col++) {
            const u0 = col / subdivX;
            const u1 = (col + 1) / subdivX;
            computeFaceCornerElevatedInto(rSubdiv, 0, u0, v0, botBuf, botO, topBuf, topO);
            computeFaceCornerElevatedInto(rSubdiv, 2, u1, v0, botBuf, botO, topBuf, topO);
            computeFaceCornerElevatedInto(rSubdiv, 4, u1, v1, botBuf, botO, topBuf, topO);
            computeFaceCornerElevatedInto(rSubdiv, 6, u0, v1, botBuf, botO, topBuf, topO);
            if (!flatQuadOverlapAabbF32(rSubdiv[0], rSubdiv[1], rSubdiv[2], rSubdiv[3], rSubdiv[4], rSubdiv[5], rSubdiv[6], rSubdiv[7], viewBoundsBuf, VIEW_TIER_CHUNKS)) continue;
            drawImageQuadWithBaseTransformScalars(ctx, canvas, u0 * canvas.width, sy0, u1 * canvas.width, sy1, rSubdiv[0], rSubdiv[1], rSubdiv[2], rSubdiv[3], rSubdiv[4], rSubdiv[5], rSubdiv[6], rSubdiv[7], baseTransform.a, baseTransform.b, baseTransform.c, baseTransform.d, baseTransform.e, baseTransform.f);
        }
    }
}
function resolveWallFaceSubdiv(face, row, viewport, grid, settings) {
    const camKey = Math.round(viewport.cameraHeight);
    const perspKey = Math.round(viewport.perspectiveStrength * 100);
    syncWallFaceDrawMemoRevision(grid);
    const slab = wallFaceDrawMemoSlab;
    if (slab.camKey[row] === camKey && slab.perspKey[row] === perspKey && slab.subdivX[row] > 0) return row;
    slab.camKey[row] = camKey;
    slab.perspKey[row] = perspKey;
    return computeWallFaceSubdivInto(row, settings, viewport);
}
function drawFaceTextureScalars(ctx, x1, y1, x2, y2, botBuf, botO, topBuf, topO, viewport, state, face) {
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    const row = resolveWallFaceAtlasScalars(x1, y1, x2, y2, state, face);
    if (row === WALL_FACE_ATLAS_MISS) return;
    if (row === WALL_FACE_ATLAS_SOLID) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    const subdivRow = resolveWallFaceSubdiv(face, row, viewport, state.obstacleGrid, state.worldSurfaces.settings);
    if (subdivRow === WALL_FACE_SUBDIV_NONE) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
        return;
    }
    blitWallFaceSubdiv(ctx, botBuf, botO, topBuf, topO, subdivRow, viewport);
}
export function drawProjectedWallFaceScalars(ctx, x1, y1, x2, y2, viewport, state, face) {
    const { wallHeight, wallBaseZ } = face;
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    const topZ = wallBaseZ + wallHeight;
    projectWallFaceBandInto(ENGINE_F32, R_FACE_BAND_BOT, x1, y1, x2, y2, wallBaseZ, viewport);
    projectWallFaceBandInto(ENGINE_F32, R_FACE_BAND_TOP, x1, y1, x2, y2, topZ, viewport);
    traceProjectedFaceBand(ctx, ENGINE_F32, R_FACE_BAND_BOT, ENGINE_F32, R_FACE_BAND_TOP);
    if (state.worldSurfaces) {
        ctx.save();
        ctx.clip();
        drawFaceTextureScalars(ctx, x1, y1, x2, y2, ENGINE_F32, R_FACE_BAND_BOT, ENGINE_F32, R_FACE_BAND_TOP, viewport, state, face);
        ctx.restore();
    } else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
}
export function projectRailWallTopCornersIntoFlat(out8, data, base, viewport) {
    const z = data[base + RAIL_BOX.wallCapHeight];
    projectWorldQuad(out8, 0, data[base + RAIL_BOX.outerP1x], data[base + RAIL_BOX.outerP1y], data[base + RAIL_BOX.outerP2x], data[base + RAIL_BOX.outerP2y], data[base + RAIL_BOX.innerP2x], data[base + RAIL_BOX.innerP2y], data[base + RAIL_BOX.innerP1x], data[base + RAIL_BOX.innerP1y], z, viewport);
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
    drawImageTriangleWithBaseTransformScalars(ctx, canvas, src8[0], src8[1], src8[2], src8[3], src8[6], src8[7], dest8[0], dest8[1], dest8[2], dest8[3], dest8[6], dest8[7], baseTransform.a, baseTransform.b, baseTransform.c, baseTransform.d, baseTransform.e, baseTransform.f);
    drawImageTriangleWithBaseTransformScalars(ctx, canvas, src8[2], src8[3], src8[4], src8[5], src8[6], src8[7], dest8[2], dest8[3], dest8[4], dest8[5], dest8[6], dest8[7], baseTransform.a, baseTransform.b, baseTransform.c, baseTransform.d, baseTransform.e, baseTransform.f);
    ctx.restore();
}
export function drawProjectedRailWallCapFlat(ctx, data, base, viewport, state, face) {
    const worldSurfaces = state.worldSurfaces;
    const fillStyle = gameWorldSurfaceSettings.floorShadow;
    projectRailWallTopCornersIntoFlat(rCapCorners, data, base, viewport);
    if (!worldSurfaces) {
        fillProjectedCapPolygonFlat(ctx, rCapCorners, fillStyle);
        return;
    }
    flatRailWallCapUvCornersIntoFlat(rCapUv, state.obstacleGrid, data, base);
    const wallCapHeight = data[base + RAIL_BOX.wallCapHeight];
    const capCanvas = worldSurfaces.fillHorizontalCapDrawSampleIntoFlat(rCapUv, wallCapHeight, state, rCapSrc);
    if (!capCanvas) {
        fillProjectedCapPolygonFlat(ctx, rCapCorners, fillStyle);
        return;
    }
    blitHorizontalCapSampleFlat(ctx, rCapCorners, rCapSrc, capCanvas);
}
export function createConveyorDraw(options = {}) {
    const { turnDirection = null, chevronColors: chevronColorsOverride } = options;
    const chevronColors = chevronColorsOverride ?? { fill: "#0EA5E9", stroke: "#0284C7" };
    const beltFill = "#1e1e1e";
    return (ctx, prop, viewport) => {
        const hx = prop.halfExtents?.x ?? 8;
        const hy = prop.halfExtents?.y ?? 8;
        const lineScale = getCanvasLineScale(ctx);
        const angle = readEntityFacing(prop);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const px = prop.x;
        const py = prop.y;
        function writeLocalXY(out, offset, lx, ly) {
            out[offset] = px + lx * cos - ly * sin;
            out[offset + 1] = py + lx * sin + ly * cos;
        }
        writeLocalXY(rQuadA, 0, -hx, -hy);
        writeLocalXY(rQuadA, 2, hx, -hy);
        writeLocalXY(rQuadA, 4, hx, hy);
        writeLocalXY(rQuadA, 6, -hx, hy);
        ctx.beginPath();
        traceClosedFlatPolygon(ctx, rQuadA, 4);
        ctx.fillStyle = beltFill;
        ctx.fill();
        if (!turnDirection) {
            ctx.save();
            ctx.beginPath();
            traceClosedFlatPolygon(ctx, rQuadA, 4);
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
                writeLocalXY(rQuadA, 0, cx, -hy);
                writeLocalXY(rQuadA, 2, cx, hy);
                ctx.beginPath();
                ctx.moveTo(rQuadA[0], rQuadA[1]);
                ctx.lineTo(rQuadA[2], rQuadA[3]);
                ctx.stroke();
            }
            ctx.fillStyle = chevronColors.fill;
            ctx.strokeStyle = chevronColors.stroke;
            ctx.lineWidth = 0.5 * lineScale;
            const numChevrons = Math.ceil((hx * 2) / spacing) + 2;
            for (let i = -2; i < numChevrons; i++) {
                const cx = -hx + offset + i * spacing;
                writeLocalXY(rChevron, 0, cx + 1.5, 0);
                writeLocalXY(rChevron, 2, cx - 1.2, 3.2);
                writeLocalXY(rChevron, 4, cx - 0.4, 3.2);
                writeLocalXY(rChevron, 6, cx + 0.8, 0);
                writeLocalXY(rChevron, 8, cx - 0.4, -3.2);
                writeLocalXY(rChevron, 10, cx - 1.2, -3.2);
                ctx.beginPath();
                traceClosedFlatPolygon(ctx, rChevron, 6);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        const isLeft = turnDirection === "left";
        const pivotX = 8;
        const pivotY = isLeft ? 8 : -8;
        const startAngle = Math.PI;
        const dir = isLeft ? 1 : -1;
        ctx.save();
        ctx.beginPath();
        writeLocalXY(rQuadA, 0, -hx, -hy);
        writeLocalXY(rQuadA, 2, hx, -hy);
        writeLocalXY(rQuadA, 4, hx, hy);
        writeLocalXY(rQuadA, 6, -hx, hy);
        traceClosedFlatPolygon(ctx, rQuadA, 4);
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
            writeLocalXY(rQuadA, 0, pivotX, pivotY);
            writeLocalXY(rQuadA, 2, pivotX + 25 * Math.cos(A), pivotY + 25 * Math.sin(A));
            ctx.beginPath();
            ctx.moveTo(rQuadA[0], rQuadA[1]);
            ctx.lineTo(rQuadA[2], rQuadA[3]);
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
            writeLocalXY(rChevron, 0, pivotX + 8 * Math.cos(tipAngle), pivotY + 8 * Math.sin(tipAngle));
            writeLocalXY(rChevron, 2, pivotX + (8 - 3.2) * Math.cos(wingAngle), pivotY + (8 - 3.2) * Math.sin(wingAngle));
            writeLocalXY(rChevron, 4, pivotX + (8 - 3.2) * Math.cos(innerAngle), pivotY + (8 - 3.2) * Math.sin(innerAngle));
            writeLocalXY(rChevron, 6, pivotX + 8 * Math.cos(innerTipAngle), pivotY + 8 * Math.sin(innerTipAngle));
            writeLocalXY(rChevron, 8, pivotX + (8 + 3.2) * Math.cos(innerAngle), pivotY + (8 + 3.2) * Math.sin(innerAngle));
            writeLocalXY(rChevron, 10, pivotX + (8 + 3.2) * Math.cos(wingAngle), pivotY + (8 + 3.2) * Math.sin(wingAngle));
            ctx.beginPath();
            traceClosedFlatPolygon(ctx, rChevron, 6);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    };
}
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
const match3d = (p) => p.strategy?.renderMode === PROP_RENDER_MODE_3D;
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
    const worldSurfaces = state.worldSurfaces;
    worldSurfaces.ensureWallChunkProfileTextures(state, prop.wallChunkProfileId, prop.wallChunkHeightPx);
    bindWallChunkTexturePipeline(worldSurfaces);
    const ready = worldSurfaces._wallChunkReady;
    if (prop._wallChunkTextureReady !== ready) {
        prop._cachedStaticKey = undefined;
        prop._staticKeyPhysicsKey = undefined;
        prop._staticKeyCustom = undefined;
    }
    prop._wallChunkTextureReady = ready;
}
export class WorldSceneRenderer {
    constructor() {
        this.visibleDrawQueue = new VisibleDrawQueue();
        this.wallFaceScratch = { wallHeight: 0, wallBaseZ: 0, wallCapHeight: 0, cacheObj: null, atlasFaceId: undefined, gridSide: 0, gridIdx: 0, isEdgeRail: false };
    }
    _appendVisible3dProps(state, viewport) {
        const count = state.entityRegistry.queryViewTier(state.spatialFrame, VIEW_TIER_PROPS, "3d", match3d);
        const ids = state.entityRegistry.borrowedQueryIds("3d");
        for (let i = 0; i < count; i++) {
            const eid = ids[i];
            const p = state.entityRegistry.getRef(eid);
            if (!p) continue;
            const distSq = (p.x - viewport.x) ** 2 + (p.y - viewport.y) ** 2;
            this.visibleDrawQueue.push(DRAW_KIND_PROP, 0, p, distSq);
        }
        state.fractureEngine.debris.appendVisibleProps(this.visibleDrawQueue, viewport, DRAW_KIND_PROP);
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
        const flatProps = options.flatProps === true;
        const radialSpheres = options.radialSpheres === true;
        for (let i = 0; i < q.length; i++) {
            const kind = q.kinds[i];
            const baseIndex = q.baseIndices[i];
            const ref = q.refs[i];
            if (kind === DRAW_KIND_PROP) this._drawProp(ctx, ref, viewport, state, flatProps, radialSpheres);
            else if (kind === DRAW_KIND_VOXEL) {
                bindWallFaceScratchFlat(face, DRAW_KIND_VOXEL, baseIndex);
                drawProjectedVoxelWallFaceFlat(ctx, baseIndex, viewport, state, face);
            } else if (kind === DRAW_KIND_RAIL) {
                bindWallFaceScratchFlat(face, DRAW_KIND_RAIL, baseIndex);
                drawProjectedGridEdgeRailFlat(ctx, baseIndex, viewport, state, face, skipWallCaps);
            }
        }
    }
    _drawProp(ctx, prop, viewport, state, flatProps, radialSpheres) {
        const hasAlpha = prop.alpha !== undefined && prop.alpha !== 1;
        const prevAlpha = ctx.globalAlpha;
        if (hasAlpha) ctx.globalAlpha = prevAlpha * prop.alpha;
        try {
            const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
            const draw = propCatalog[renderKey]?.drawRecipe;
            if (!draw) return;
            prepareWallChunkPropTextures(state, prop);
            drawCachedPropSprite(ctx, prop, viewport, renderKey, draw, 0, resolvePropFlatPresentation(flatProps, radialSpheres, prop));
        } finally {
            if (hasAlpha) ctx.globalAlpha = prevAlpha;
        }
    }
}
function resolvePropFlatPresentation(flatProps, radialSpheres, prop) {
    const isSphere = prop.shape?.shapeTypeId === SHAPE_TYPE_CIRCLE;
    return flatProps && !(radialSpheres && isSphere);
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
export function edgeSegmentOutsideCircle(edge, centerX, centerY, rangeSq) {
    aabbFromTwoPointsF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, edge.x1, edge.y1, edge.x2, edge.y2);
    return distanceSqToAabbF32(centerX, centerY, ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP) > rangeSq;
}
function clampSegmentCoord(a, b, v) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return v < lo ? lo : v > hi ? hi : v;
}
function edgeSegmentOutsideCircleFlat(data, base, centerX, centerY, rangeSq) {
    aabbFromTwoPointsF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, data[base], data[base + 1], data[base + 2], data[base + 3]);
    return distanceSqToAabbF32(centerX, centerY, ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP) > rangeSq;
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
        projectWallShadowQuadScreen(quadScratch, 0, viewport, lightX, lightY, lightZ, x1, y1, x2, y2, wallTopZ, range * 2);
        emitQuad(quadScratch, 4);
    }
}
const sEdgeScratch = new EdgeList();
const rLosQuad = ENGINE_F32.subarray(S_QUAD, S_QUAD + 8);
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
    viewport.worldToScreenF32(ENGINE_F32, S_OUT_SCREEN, lightX, lightY);
    centerReachAabbF32(ENGINE_F32, S_AABB, lightX, lightY, range);
    collectExposedWallEdgesInAabbF32(obstacleGrid, ENGINE_F32, S_AABB, sEdgeScratch);
    collectRailWallShadowEdgesInAabbF32(obstacleGrid, ENGINE_F32, S_AABB, sEdgeScratch);
    fillMaskBase(overlayCtx, canvasW, canvasH, `rgba(0,0,0,${overlayAlpha})`);
    cutOutRadialSoftDisc(overlayCtx, ENGINE_F32[S_OUT_SCREEN], ENGINE_F32[S_OUT_SCREEN + 1], screenRange);
    addMaskPathFill(overlayCtx, `rgba(0,0,0,${overlayAlpha})`, (pathCtx) => {
        let hasShadows = false;
        forEachLosShadowQuadInRange(sEdgeScratch, lightX, lightY, range, lightZ, viewport, rLosQuad, (flatVerts, vertCount) => {
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
export function collectRailWallShadowEdgesInAabbF32(grid, buf, o, out) {
    collectRailWallBoxesInAabbF32(grid, buf, o, sRailShadowBoxes);
    for (let i = 0; i < sRailShadowBoxes.length; i++) pushRailWallBoxCapShadowEdges(sRailShadowBoxes.data, i, out);
}
