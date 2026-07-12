import { traceAabbRect, strokeSegment, traceSegment, fillStrokeCircle, strokeCircle, strokeOpenPolylineF32, traceClosedFlatPolygon, traceFlatQuad, fillRgbaBuffer, fillRgbaRect, strokeAxisLineRgba, createOffscreenCanvas, resizeOffscreenCanvas, drawCachedOverlayGlyph, drawCachedPropSprite, drawImageQuadFromFlatRingsWithBaseTransform, drawImageQuadWithBaseTransformScalars, drawImageTriangleWithBaseTransformScalars, blitMaskOverlay, addMaskPathFill, cutOutRadialSoftDisc, fillMaskBase, traceWoundFlatQuad, traceCircle } from "../Canvas/canvas.js";
import { isRailWallEdge, forEachCellEdge, gridNavCacheKey, resolveElevationAlpha, extrudeLocalVertsInto, isOutwardFaceTowardViewer, projectWorldPoint, projectWorldQuad, resolveSurfaceProfileId, SURFACE_MATERIAL_OWNER, cellInRect, floorOccupancyStampDrawCacheKey, projectWallShadowQuadScreen, collectExposedWallEdgesInAabbF32 } from "../Spatial/spatial.js";
import { quantizeAngleIndex, normalizeXYInto, lengthXY, flatQuadOverlapAabbF32, aabbFromTwoPointsF32, distanceSqToAabbF32, centerReachAabbF32, hashString, mixHash4 } from "../Math/math.js";
import { ENGINE_F32, ENGINE_U8, ENGINE_BOUNDS_BASE, B_TMP, M_OUT_NX, M_OUT_NY, M_OUT_LEN, M_OUT_VX, M_OUT_VY, M_OUT_VZ, S_OUT_XY, S_OUT_SCREEN, S_AABB, S_QUAD, R_QUAD_A, R_SUBDIV, R_CAP_CORNERS, R_CAP_UV, R_CAP_SRC, R_CHEVRON, R_FACE_BAND_BOT, R_FACE_BAND_TOP, U8_FACE_VISIBLE, MAX_PRISM_FACES, wallFaceDrawMemoSlab, clearWallFaceDrawMemoSlab, viewBoundsBuf, VIEW_TIER_PROPS, VIEW_TIER_STRUCTURE, VIEW_TIER_CHUNKS, entityRefs, GrowF32 } from "../../Core/engineMemory.js";
import { transformRollVertexInto, readEntityFacing } from "../Physics/physics.js";
import { PROP_RENDER_MODE_3D, DRAW_KIND_PROP, DRAW_KIND_VOXEL, DRAW_KIND_RAIL, PATH_OVERLAY_MODE_FLOW, PATH_OVERLAY_MODE_HPA, SANDBOX_PATH_VISUAL_NORMAL, OVERLAY_CMD_AABB, OVERLAY_CMD_CIRCLE_STROKE, OVERLAY_CMD_CIRCLE_FILL_STROKE, OVERLAY_CMD_SEGMENT, OVERLAY_CMD_POLYLINE, OVERLAY_CMD_AIM_SEGMENT, OVERLAY_RENDER_KEY_SELECTION_RING, OVERLAY_RENDER_KEY_PATH_DESTINATION, OVERLAY_RENDER_KEY_GRID_CELL_HIGHLIGHT, OVERLAY_RENDER_KEY_PATH_DEBUG_NODE, SHAPE_TYPE_CIRCLE, WALL_FACE_ATLAS_MISS, WALL_FACE_SUBDIV_NONE } from "../../Core/engineEnums.js";
import { collectVoxelWallFacesInAabbFlatF32, collectRailWallBoxesInAabbF32, flatRailWallCapUvCornersIntoFlat, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { VOXEL_FACE_CX, VOXEL_FACE_CY, VOXEL_FACE_OUT_X, VOXEL_FACE_OUT_Y, VOXEL_FACE_X1, VOXEL_FACE_Y1, VOXEL_FACE_X2, VOXEL_FACE_Y2, VOXEL_FACE_WALL_HEIGHT, VOXEL_FACE_WALL_BASE_Z, VOXEL_FACE_WALL_CAP_HEIGHT, VOXEL_FACE_GRID_SIDE, VOXEL_FACE_GRID_IDX, VOXEL_FACE_STRIDE, RAIL_BOX_MIN_X, RAIL_BOX_MAX_X, RAIL_BOX_MIN_Y, RAIL_BOX_MAX_Y, RAIL_BOX_INNER_P1X, RAIL_BOX_INNER_P1Y, RAIL_BOX_INNER_P2X, RAIL_BOX_INNER_P2Y, RAIL_BOX_OUTER_P1X, RAIL_BOX_OUTER_P1Y, RAIL_BOX_OUTER_P2X, RAIL_BOX_OUTER_P2Y, RAIL_BOX_INWARD_X, RAIL_BOX_INWARD_Y, RAIL_BOX_CX, RAIL_BOX_CY, RAIL_BOX_WALL_CAP_HEIGHT, RAIL_BOX_WALL_HEIGHT, RAIL_BOX_WALL_BASE_Z, RAIL_BOX_GRID_SIDE, RAIL_BOX_GRID_IDX, RAIL_BOX_STRIDE } from "../World/wallGridStride.js";
import { StrideFloatList } from "../World/StrideFloatList.js";
import propCatalog from "../../Assets/props/index.js";
import { getSurfaceProfileRevision, SS_POINTS } from "../WorldSurface/worldSurface.js";
import { propShapeFootprintId } from "../Props/props.js";
const WALL_ATLAS_FACE_NONE = 0;
const WALL_ATLAS_FACE_INNER = 1;
const WALL_ATLAS_FACE_OUTER = 2;
const WALL_ATLAS_FACE_END0 = 3;
const WALL_ATLAS_FACE_END1 = 4;
const WALL_ATLAS_WRAP = new Float32Array(4);
const WF_F_WALL_HEIGHT = 0;
const WF_F_WALL_BASE_Z = 1;
const WF_F_WALL_CAP_HEIGHT = 2;
const WF_F_COUNT = 3;
const WF_I_ATLAS_FACE_KIND = 0;
const WF_I_GRID_SIDE = 1;
const WF_I_GRID_IDX = 2;
const WF_I_IS_EDGE_RAIL = 3;
const WF_I_COUNT = 4;
const wallFaceF32 = new Float32Array(WF_F_COUNT);
const wallFaceI32 = new Int32Array(WF_I_COUNT);
export function writeWallFaceScratch(wallHeight, wallBaseZ, wallCapHeight, gridSide, gridIdx, isEdgeRail, atlasFaceKind = WALL_ATLAS_FACE_NONE) {
    wallFaceF32[WF_F_WALL_HEIGHT] = wallHeight;
    wallFaceF32[WF_F_WALL_BASE_Z] = wallBaseZ;
    wallFaceF32[WF_F_WALL_CAP_HEIGHT] = wallCapHeight;
    wallFaceI32[WF_I_GRID_SIDE] = gridSide;
    wallFaceI32[WF_I_GRID_IDX] = gridIdx;
    wallFaceI32[WF_I_IS_EDGE_RAIL] = isEdgeRail ? 1 : 0;
    wallFaceI32[WF_I_ATLAS_FACE_KIND] = atlasFaceKind;
}
function writeWallFaceFromRailBox(d, b) {
    wallFaceF32[WF_F_WALL_HEIGHT] = d[b + RAIL_BOX_WALL_HEIGHT];
    wallFaceF32[WF_F_WALL_BASE_Z] = d[b + RAIL_BOX_WALL_BASE_Z];
    wallFaceF32[WF_F_WALL_CAP_HEIGHT] = d[b + RAIL_BOX_WALL_CAP_HEIGHT];
    wallFaceI32[WF_I_GRID_SIDE] = d[b + RAIL_BOX_GRID_SIDE];
    wallFaceI32[WF_I_GRID_IDX] = d[b + RAIL_BOX_GRID_IDX];
    wallFaceI32[WF_I_IS_EDGE_RAIL] = 1;
    wallFaceI32[WF_I_ATLAS_FACE_KIND] = WALL_ATLAS_FACE_NONE;
}
function writeWallFaceFromVoxelFace(d, b) {
    wallFaceF32[WF_F_WALL_HEIGHT] = d[b + VOXEL_FACE_WALL_HEIGHT];
    wallFaceF32[WF_F_WALL_BASE_Z] = d[b + VOXEL_FACE_WALL_BASE_Z];
    wallFaceF32[WF_F_WALL_CAP_HEIGHT] = d[b + VOXEL_FACE_WALL_CAP_HEIGHT];
    wallFaceI32[WF_I_GRID_SIDE] = d[b + VOXEL_FACE_GRID_SIDE];
    wallFaceI32[WF_I_GRID_IDX] = d[b + VOXEL_FACE_GRID_IDX];
    wallFaceI32[WF_I_IS_EDGE_RAIL] = 0;
    wallFaceI32[WF_I_ATLAS_FACE_KIND] = WALL_ATLAS_FACE_NONE;
}
let flatProjectedVerts = ENGINE_F32.subarray(R_QUAD_A, R_QUAD_A + 8);
const rQuadA = ENGINE_F32.subarray(R_QUAD_A, R_QUAD_A + 8);
const rSubdiv = ENGINE_F32.subarray(R_SUBDIV, R_SUBDIV + 8);
const rCapCorners = ENGINE_F32.subarray(R_CAP_CORNERS, R_CAP_CORNERS + 8);
const rCapUv = ENGINE_F32.subarray(R_CAP_UV, R_CAP_UV + 8);
const rCapSrc = ENGINE_F32.subarray(R_CAP_SRC, R_CAP_SRC + 8);
const rChevron = ENGINE_F32.subarray(R_CHEVRON, R_CHEVRON + 12);
const rFaceVisible = ENGINE_U8.subarray(U8_FACE_VISIBLE, U8_FACE_VISIBLE + MAX_PRISM_FACES);
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
    if (dirX == null || dirY == null) return 0;
    return quantizeAngleIndex(Math.atan2(dirY, dirX), steps);
}
const OVERLAY_FLAG_CACHE = 1;
const OVERLAY_FLAG_DASH = 2;
const OVERLAY_FLAG_ARROWHEAD = 4;
const OVERLAY_FLAG_GLOW = 8;
const OVERLAY_FLAG_LINECAP_ROUND = 16;
const OVERLAY_FLAG_HUE = 32;
const OVERLAY_F_STRIDE = 12;
const OVERLAY_F_G0 = 0;
const OVERLAY_F_G1 = 1;
const OVERLAY_F_G2 = 2;
const OVERLAY_F_G3 = 3;
const OVERLAY_F_LINE_WIDTH = 4;
const OVERLAY_F_DASH_A = 5;
const OVERLAY_F_DASH_B = 6;
const OVERLAY_F_WORLD_SPAN = 7;
const OVERLAY_F_ANCHOR_X = 8;
const OVERLAY_F_ANCHOR_Y = 9;
const OVERLAY_F_HUE = 10;
const OVERLAY_F_EXTRA1 = 11;
const OVERLAY_INIT_CAP = 128;
function packOverlayRgba(r, g, b, a01) {
    const a = a01 <= 0 ? 0 : a01 >= 1 ? 255 : (a01 * 255 + 0.5) | 0;
    return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
}
function cssFromOverlayRgba(packed) {
    if (!packed) return null;
    const a = (packed >>> 24) & 255;
    const r = (packed >>> 16) & 255;
    const g = (packed >>> 8) & 255;
    const b = packed & 255;
    if (a === 255) return "rgb(" + r + "," + g + "," + b + ")";
    return "rgba(" + r + "," + g + "," + b + "," + (a / 255).toFixed(3) + ")";
}
export const OVERLAY_STYLE_SELECTION_RING = 0;
export const OVERLAY_STYLE_FLOOR_CELL = 1;
export const OVERLAY_STYLE_VOXEL_CELL = 2;
export const OVERLAY_STYLE_MARQUEE = 3;
export const OVERLAY_STYLE_RAIL_EDGE = 4;
export const OVERLAY_STYLE_PATH_DIRECT_DASH = 5;
export const OVERLAY_STYLE_PATH_DIRECT = 6;
export const OVERLAY_STYLE_PATH_DIRECT_END = 7;
export const OVERLAY_STYLE_PATH_FLOW = 8;
export const OVERLAY_STYLE_PATH_HPA = 9;
export const OVERLAY_STYLE_PATH_DIRECT_DEBUG = 10;
export const OVERLAY_STYLE_PATH_DIRECT_DEST = 11;
export const OVERLAY_STYLE_PATH_FLOW_DEBUG = 12;
export const OVERLAY_STYLE_PATH_HPA_DEBUG = 13;
export const OVERLAY_STYLE_PATH_DEBUG_NODE_FLOW = 14;
export const OVERLAY_STYLE_PATH_DEBUG_NODE_HPA = 15;
export const OVERLAY_STYLE_DRAG_BASE = 16;
export const OVERLAY_STYLE_DRAG_GRAB_LINE = 16;
export const OVERLAY_STYLE_DRAG_GRAB_DOT_A = 17;
export const OVERLAY_STYLE_DRAG_GRAB_DOT_B = 18;
export const OVERLAY_STYLE_DRAG_BAND = 19;
export const OVERLAY_STYLE_DRAG_PULL_LINE = 20;
export const OVERLAY_STYLE_DRAG_PULL_DOT = 21;
export const OVERLAY_STYLE_DRAG_START_RING = 22;
export const OVERLAY_STYLE_DRAG_START_DOT = 23;
export const OVERLAY_STYLE_DRAG_RUBBER = 24;
export const OVERLAY_STYLE_DRAG_ANCHOR = 25;
export const OVERLAY_STYLE_DRAG_AIM = 26;
export const OVERLAY_STYLE_COUNT = 27;
const OVERLAY_STYLE_STROKE_RGBA = new Uint32Array([packOverlayRgba(255, 252, 245, 0.32), packOverlayRgba(120, 200, 255, 0.75), packOverlayRgba(255, 152, 0, 0.85), packOverlayRgba(255, 252, 245, 0.32), packOverlayRgba(255, 152, 0, 0.9), packOverlayRgba(0, 188, 212, 0.55), packOverlayRgba(0, 188, 212, 0.85), packOverlayRgba(0, 188, 212, 0.85), packOverlayRgba(76, 175, 80, 0.65), packOverlayRgba(156, 39, 176, 0.65), packOverlayRgba(0, 188, 212, 0.65), packOverlayRgba(255, 255, 255, 1), packOverlayRgba(76, 175, 80, 1), packOverlayRgba(0, 229, 255, 1), packOverlayRgba(255, 255, 255, 1), packOverlayRgba(255, 255, 255, 1), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const OVERLAY_STYLE_FILL_RGBA = new Uint32Array([0, packOverlayRgba(120, 200, 255, 0.1), packOverlayRgba(255, 152, 0, 0.12), packOverlayRgba(255, 252, 245, 0.05), 0, 0, 0, 0, 0, 0, 0, packOverlayRgba(0, 188, 212, 0.85), 0, 0, packOverlayRgba(76, 175, 80, 1), packOverlayRgba(0, 229, 255, 1), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const OVERLAY_STYLE_LINE_WIDTH = new Float32Array([1, 1, 1, 1, 3, 1.5, 2, 2, 2.5, 2.5, 3, 1, 4, 4, 1, 1, 1.5, 1.5, 1.5, 1, 1, 1.5, 1.5, 1, 2, 2, 3]);
const OVERLAY_STYLE_DASH_A = new Float32Array([4, 4, 4, 4, NaN, 4, NaN, NaN, NaN, NaN, 8, NaN, NaN, NaN, NaN, NaN, 3, NaN, NaN, 4, 3, NaN, NaN, NaN, 6, NaN, NaN]);
const OVERLAY_STYLE_DASH_B = new Float32Array([4, 3, 3, 4, NaN, 4, NaN, NaN, NaN, NaN, 6, NaN, NaN, NaN, NaN, NaN, 3, NaN, NaN, 4, 3, NaN, NaN, NaN, 4, NaN, NaN]);
const OVERLAY_STYLE_NODE_R = new Float32Array([0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 10, 0, 0, 6, 6, 0, 3, 4, 0, 0, 4, 5, 1.5, 0, 7, 0]);
const OVERLAY_STYLE_STROKE_CSS = new Array(OVERLAY_STYLE_COUNT);
const OVERLAY_STYLE_FILL_CSS = new Array(OVERLAY_STYLE_COUNT);
for (let si = 0; si < OVERLAY_STYLE_COUNT; si++) {
    OVERLAY_STYLE_STROKE_CSS[si] = cssFromOverlayRgba(OVERLAY_STYLE_STROKE_RGBA[si]);
    OVERLAY_STYLE_FILL_CSS[si] = cssFromOverlayRgba(OVERLAY_STYLE_FILL_RGBA[si]);
}
const OVERLAY_HUE_STEP = 5;
const OVERLAY_HUE_COUNT = 72;
const OVERLAY_DRAG_HUE_RECIPE = [
    { sS: 90, sL: 55, sA: 0.35, fA: 0 },
    { sS: 90, sL: 55, sA: 0.85, fS: 90, fL: 55, fA: 0.45 },
    { sS: 90, sL: 55, sA: 0.85, fS: 90, fL: 55, fA: 0.35 },
    { sS: 90, sL: 55, sA: 0.15, fA: 0 },
    { sS: 90, sL: 55, sA: 0.12, fA: 0 },
    { sS: 90, sL: 55, sA: 0.85, fS: 90, fL: 55, fA: 0.35 },
    { sS: 90, sL: 55, sA: 0.4, fA: 0 },
    { sS: 90, sL: 55, sA: 0.65, fS: 90, fL: 55, fA: 0.65 },
    { sS: 90, sL: 55, sA: 0.4, fA: 0 },
    { sS: 100, sL: 60, sA: 0.85, fA: 0 },
    { sS: 100, sL: 50, sA: 1, fA: 0 },
];
const OVERLAY_DRAG_STROKE_CSS = new Array(OVERLAY_DRAG_HUE_RECIPE.length);
const OVERLAY_DRAG_FILL_CSS = new Array(OVERLAY_DRAG_HUE_RECIPE.length);
const OVERLAY_DRAG_GLOW_CSS = new Array(OVERLAY_HUE_COUNT);
for (let ri = 0; ri < OVERLAY_DRAG_HUE_RECIPE.length; ri++) {
    const recipe = OVERLAY_DRAG_HUE_RECIPE[ri];
    const strokes = new Array(OVERLAY_HUE_COUNT);
    const fills = new Array(OVERLAY_HUE_COUNT);
    for (let hi = 0; hi < OVERLAY_HUE_COUNT; hi++) {
        const h = hi * OVERLAY_HUE_STEP;
        strokes[hi] = recipe.sA >= 1 ? "hsl(" + h + ", " + recipe.sS + "%, " + recipe.sL + "%)" : "hsla(" + h + ", " + recipe.sS + "%, " + recipe.sL + "%, " + recipe.sA + ")";
        fills[hi] = recipe.fA > 0 ? "hsla(" + h + ", " + recipe.fS + "%, " + recipe.fL + "%, " + recipe.fA + ")" : null;
    }
    OVERLAY_DRAG_STROKE_CSS[ri] = strokes;
    OVERLAY_DRAG_FILL_CSS[ri] = fills;
}
for (let hi = 0; hi < OVERLAY_HUE_COUNT; hi++) OVERLAY_DRAG_GLOW_CSS[hi] = "hsla(" + hi * OVERLAY_HUE_STEP + ", 100%, 50%, 0.6)";
function overlayHueIndex(hue) {
    const h = ((hue % 360) + 360) % 360;
    return ((h / OVERLAY_HUE_STEP + 0.5) | 0) % OVERLAY_HUE_COUNT;
}
function overlayStrokeCss(slab, i) {
    const styleId = slab.styleId[i];
    if (slab.flags[i] & OVERLAY_FLAG_HUE) return OVERLAY_DRAG_STROKE_CSS[styleId - OVERLAY_STYLE_DRAG_BASE][overlayHueIndex(slab.f[i * OVERLAY_F_STRIDE + OVERLAY_F_HUE])];
    return OVERLAY_STYLE_STROKE_CSS[styleId];
}
function overlayFillCss(slab, i) {
    const styleId = slab.styleId[i];
    if (slab.flags[i] & OVERLAY_FLAG_HUE) return OVERLAY_DRAG_FILL_CSS[styleId - OVERLAY_STYLE_DRAG_BASE][overlayHueIndex(slab.f[i * OVERLAY_F_STRIDE + OVERLAY_F_HUE])];
    return OVERLAY_STYLE_FILL_CSS[styleId];
}
function createOverlayCommandSlab(initialCap = OVERLAY_INIT_CAP) {
    return { count: 0, kind: new Uint8Array(initialCap), flags: new Uint8Array(initialCap), styleId: new Uint8Array(initialCap), f: new Float32Array(initialCap * OVERLAY_F_STRIDE), polyBase: new Int32Array(initialCap), polyCount: new Int32Array(initialCap), cacheRenderKey: new Int32Array(initialCap), cacheCustomKey: new Int32Array(initialCap), poly: new GrowF32(256) };
}
export const overlayCommandSlab = createOverlayCommandSlab();
function ensureOverlayCmdCap(slab, need) {
    if (slab.kind.length >= need) return;
    const next = Math.max(need, slab.kind.length * 2);
    const kind = new Uint8Array(next);
    kind.set(slab.kind);
    slab.kind = kind;
    const flags = new Uint8Array(next);
    flags.set(slab.flags);
    slab.flags = flags;
    const styleId = new Uint8Array(next);
    styleId.set(slab.styleId);
    slab.styleId = styleId;
    const f = new Float32Array(next * OVERLAY_F_STRIDE);
    f.set(slab.f);
    slab.f = f;
    const polyBase = new Int32Array(next);
    polyBase.set(slab.polyBase);
    slab.polyBase = polyBase;
    const polyCount = new Int32Array(next);
    polyCount.set(slab.polyCount);
    slab.polyCount = polyCount;
    const cacheRenderKey = new Int32Array(next);
    cacheRenderKey.set(slab.cacheRenderKey);
    slab.cacheRenderKey = cacheRenderKey;
    const cacheCustomKey = new Int32Array(next);
    cacheCustomKey.set(slab.cacheCustomKey);
    slab.cacheCustomKey = cacheCustomKey;
}
export function clearOverlayCommands(slab = overlayCommandSlab) {
    slab.count = 0;
    slab.poly.used = 0;
}
function allocOverlayCmd(slab) {
    ensureOverlayCmdCap(slab, slab.count + 1);
    const i = slab.count++;
    slab.flags[i] = 0;
    slab.styleId[i] = 0;
    slab.polyBase[i] = -1;
    slab.polyCount[i] = 0;
    slab.cacheRenderKey[i] = 0;
    slab.cacheCustomKey[i] = 0;
    const b = i * OVERLAY_F_STRIDE;
    for (let k = 0; k < OVERLAY_F_STRIDE; k++) slab.f[b + k] = 0;
    return i;
}
function overlayGlyphSpan(r, lineWidth = 1, extra = 0) {
    return r * 2 + lineWidth + extra;
}
function applyOverlayStyle(slab, i, styleId, hue = NaN) {
    slab.styleId[i] = styleId;
    const b = i * OVERLAY_F_STRIDE;
    slab.f[b + OVERLAY_F_LINE_WIDTH] = OVERLAY_STYLE_LINE_WIDTH[styleId];
    const dashA = OVERLAY_STYLE_DASH_A[styleId];
    if (Number.isFinite(dashA)) {
        slab.flags[i] |= OVERLAY_FLAG_DASH;
        slab.f[b + OVERLAY_F_DASH_A] = dashA;
        slab.f[b + OVERLAY_F_DASH_B] = OVERLAY_STYLE_DASH_B[styleId];
    }
    if (Number.isFinite(hue)) {
        slab.flags[i] |= OVERLAY_FLAG_HUE;
        slab.f[b + OVERLAY_F_HUE] = hue;
    }
}
function setOverlayCache(slab, i, renderKey, customKey, worldSpan, anchorX, anchorY) {
    slab.flags[i] |= OVERLAY_FLAG_CACHE;
    slab.cacheRenderKey[i] = renderKey | 0;
    slab.cacheCustomKey[i] = customKey | 0;
    const b = i * OVERLAY_F_STRIDE;
    slab.f[b + OVERLAY_F_WORLD_SPAN] = worldSpan;
    slab.f[b + OVERLAY_F_ANCHOR_X] = anchorX;
    slab.f[b + OVERLAY_F_ANCHOR_Y] = anchorY;
}
export function beginOverlayPoly(slab) {
    return slab.poly.used;
}
export function writeOverlayPolyXY(slab, x, y) {
    const poly = slab.poly;
    poly.ensure(poly.used + 2);
    poly.buf[poly.used++] = x;
    poly.buf[poly.used++] = y;
}
export function stampOverlayPolyline(slab, polyBase, pathLen, styleId, hue = NaN) {
    const i = allocOverlayCmd(slab);
    slab.kind[i] = OVERLAY_CMD_POLYLINE;
    slab.polyBase[i] = polyBase;
    slab.polyCount[i] = pathLen;
    applyOverlayStyle(slab, i, styleId, hue);
    return i;
}
export function stampOverlaySegment(slab, x0, y0, x1, y1, styleId, hue = NaN) {
    const i = allocOverlayCmd(slab);
    slab.kind[i] = OVERLAY_CMD_SEGMENT;
    const b = i * OVERLAY_F_STRIDE;
    slab.f[b + OVERLAY_F_G0] = x0;
    slab.f[b + OVERLAY_F_G1] = y0;
    slab.f[b + OVERLAY_F_G2] = x1;
    slab.f[b + OVERLAY_F_G3] = y1;
    applyOverlayStyle(slab, i, styleId, hue);
    return i;
}
export function stampOverlayCircleStroke(slab, cx, cy, r, styleId, hue = NaN) {
    const i = allocOverlayCmd(slab);
    slab.kind[i] = OVERLAY_CMD_CIRCLE_STROKE;
    const b = i * OVERLAY_F_STRIDE;
    slab.f[b + OVERLAY_F_G0] = cx;
    slab.f[b + OVERLAY_F_G1] = cy;
    slab.f[b + OVERLAY_F_G2] = r;
    applyOverlayStyle(slab, i, styleId, hue);
    return i;
}
export function stampOverlayCircleFillStroke(slab, cx, cy, r, styleId, hue = NaN) {
    const i = allocOverlayCmd(slab);
    slab.kind[i] = OVERLAY_CMD_CIRCLE_FILL_STROKE;
    const b = i * OVERLAY_F_STRIDE;
    slab.f[b + OVERLAY_F_G0] = cx;
    slab.f[b + OVERLAY_F_G1] = cy;
    slab.f[b + OVERLAY_F_G2] = r;
    applyOverlayStyle(slab, i, styleId, hue);
    return i;
}
export function stampOverlayAabb(slab, minX, minY, maxX, maxY, styleId, hue = NaN) {
    const i = allocOverlayCmd(slab);
    slab.kind[i] = OVERLAY_CMD_AABB;
    const b = i * OVERLAY_F_STRIDE;
    slab.f[b + OVERLAY_F_G0] = minX;
    slab.f[b + OVERLAY_F_G1] = minY;
    slab.f[b + OVERLAY_F_G2] = maxX;
    slab.f[b + OVERLAY_F_G3] = maxY;
    applyOverlayStyle(slab, i, styleId, hue);
    return i;
}
export function stampSelectionRing(slab, cx, cy, r) {
    const i = stampOverlayCircleStroke(slab, cx, cy, r, OVERLAY_STYLE_SELECTION_RING);
    setOverlayCache(slab, i, OVERLAY_RENDER_KEY_SELECTION_RING, quantizeOverlayRadius(r), overlayGlyphSpan(r, OVERLAY_STYLE_LINE_WIDTH[OVERLAY_STYLE_SELECTION_RING], 4), cx, cy);
    return i;
}
export function stampFloorCellHighlight(slab, minX, minY, maxX, maxY, cellSize) {
    const i = stampOverlayAabb(slab, minX, minY, maxX, maxY, OVERLAY_STYLE_FLOOR_CELL);
    const w = maxX - minX;
    const h = maxY - minY;
    setOverlayCache(slab, i, OVERLAY_RENDER_KEY_GRID_CELL_HIGHLIGHT, mixHash4(cellSize | 0, hashString("floor"), 2, 0), Math.max(w, h), (minX + maxX) * 0.5, (minY + maxY) * 0.5);
    return i;
}
export function stampVoxelCellHighlight(slab, minX, minY, maxX, maxY, cellSize) {
    const i = stampOverlayAabb(slab, minX, minY, maxX, maxY, OVERLAY_STYLE_VOXEL_CELL);
    const w = maxX - minX;
    const h = maxY - minY;
    setOverlayCache(slab, i, OVERLAY_RENDER_KEY_GRID_CELL_HIGHLIGHT, mixHash4(cellSize | 0, hashString("voxel"), 2, 0), Math.max(w, h), (minX + maxX) * 0.5, (minY + maxY) * 0.5);
    return i;
}
export function stampPathDirect(slab, x0, y0, x1, y1, visual) {
    if (visual === SANDBOX_PATH_VISUAL_NORMAL) {
        stampOverlaySegment(slab, x0, y0, x1, y1, OVERLAY_STYLE_PATH_DIRECT_DASH);
        stampOverlaySegment(slab, x0, y0, x1, y1, OVERLAY_STYLE_PATH_DIRECT);
        stampOverlayCircleStroke(slab, x1, y1, OVERLAY_STYLE_NODE_R[OVERLAY_STYLE_PATH_DIRECT_END], OVERLAY_STYLE_PATH_DIRECT_END);
        return;
    }
    stampOverlaySegment(slab, x0, y0, x1, y1, OVERLAY_STYLE_PATH_DIRECT_DEBUG);
    const i = stampOverlayCircleFillStroke(slab, x1, y1, OVERLAY_STYLE_NODE_R[OVERLAY_STYLE_PATH_DIRECT_DEST], OVERLAY_STYLE_PATH_DIRECT_DEST);
    setOverlayCache(slab, i, OVERLAY_RENDER_KEY_PATH_DESTINATION, mixHash4(quantizeOverlayRadius(10), OVERLAY_STYLE_PATH_DIRECT_DEST, 0, 0), overlayGlyphSpan(10, 1), x1, y1);
}
export function stampPathPolyline(slab, polyBase, pathLen, mode, visual) {
    if (pathLen < 1) return;
    if (visual === SANDBOX_PATH_VISUAL_NORMAL) {
        if (mode === PATH_OVERLAY_MODE_FLOW) {
            if (pathLen >= 2) stampOverlayPolyline(slab, polyBase, pathLen, OVERLAY_STYLE_PATH_FLOW);
            return;
        }
        if (pathLen >= 2) stampOverlayPolyline(slab, polyBase, pathLen, OVERLAY_STYLE_PATH_HPA);
        return;
    }
    if (mode === PATH_OVERLAY_MODE_FLOW) {
        if (pathLen >= 2) stampOverlayPolyline(slab, polyBase, pathLen, OVERLAY_STYLE_PATH_FLOW_DEBUG);
        stampPathDebugNodes(slab, polyBase, pathLen, OVERLAY_STYLE_PATH_DEBUG_NODE_FLOW);
        return;
    }
    if (mode === PATH_OVERLAY_MODE_HPA) {
        if (pathLen >= 2) stampOverlayPolyline(slab, polyBase, pathLen, OVERLAY_STYLE_PATH_HPA_DEBUG);
        stampPathDebugNodes(slab, polyBase, pathLen, OVERLAY_STYLE_PATH_DEBUG_NODE_HPA);
        return;
    }
}
function stampPathDebugNodes(slab, polyBase, pathLen, styleId) {
    const r = OVERLAY_STYLE_NODE_R[styleId];
    const customKey = mixHash4(quantizeOverlayRadius(r), styleId, 0, 0);
    for (let n = 0; n < pathLen; n++) {
        const o = polyBase + n * 2;
        const cx = slab.poly.buf[o];
        const cy = slab.poly.buf[o + 1];
        const i = stampOverlayCircleFillStroke(slab, cx, cy, r, styleId);
        setOverlayCache(slab, i, OVERLAY_RENDER_KEY_PATH_DEBUG_NODE, customKey, overlayGlyphSpan(r, 1), cx, cy);
    }
}
export function stampOverlayAimSegment(slab, x1, y1, x2, y2, hue) {
    const i = allocOverlayCmd(slab);
    slab.kind[i] = OVERLAY_CMD_AIM_SEGMENT;
    const b = i * OVERLAY_F_STRIDE;
    slab.f[b + OVERLAY_F_G0] = x1;
    slab.f[b + OVERLAY_F_G1] = y1;
    slab.f[b + OVERLAY_F_G2] = x2;
    slab.f[b + OVERLAY_F_G3] = y2;
    applyOverlayStyle(slab, i, OVERLAY_STYLE_DRAG_AIM, hue);
    slab.flags[i] |= OVERLAY_FLAG_ARROWHEAD | OVERLAY_FLAG_GLOW;
    return i;
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
function drawAabbStyle(ctx, minX, minY, maxX, maxY, fill, stroke, lineWidth = 1, dashA = NaN, dashB = NaN) {
    const w = maxX - minX;
    const h = maxY - minY;
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(minX, minY, w, h);
    }
    if (!stroke) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    const hasDash = Number.isFinite(dashA);
    if (hasDash) ctx.setLineDash([dashA, Number.isFinite(dashB) ? dashB : 0]);
    ctx.beginPath();
    traceAabbRect(ctx, minX, minY, maxX, maxY);
    ctx.stroke();
    if (hasDash) ctx.setLineDash([]);
}
function applyOverlayDash(ctx, slab, i) {
    if (!(slab.flags[i] & OVERLAY_FLAG_DASH)) return false;
    const b = i * OVERLAY_F_STRIDE;
    ctx.setLineDash([slab.f[b + OVERLAY_F_DASH_A], slab.f[b + OVERLAY_F_DASH_B]]);
    return true;
}
function bakeOverlayCommandAt(ctx, anchorX, anchorY, slab, i) {
    const kind = slab.kind[i];
    const b = i * OVERLAY_F_STRIDE;
    const stroke = overlayStrokeCss(slab, i);
    const fill = overlayFillCss(slab, i);
    if (kind === OVERLAY_CMD_CIRCLE_STROKE) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = slab.f[b + OVERLAY_F_LINE_WIDTH];
        const dashed = applyOverlayDash(ctx, slab, i);
        strokeCircle(ctx, anchorX, anchorY, slab.f[b + OVERLAY_F_G2]);
        if (dashed) ctx.setLineDash([]);
        return;
    }
    if (kind === OVERLAY_CMD_CIRCLE_FILL_STROKE) {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = slab.f[b + OVERLAY_F_LINE_WIDTH];
        fillStrokeCircle(ctx, anchorX, anchorY, slab.f[b + OVERLAY_F_G2]);
        return;
    }
    if (kind === OVERLAY_CMD_AABB) {
        const w = slab.f[b + OVERLAY_F_G2] - slab.f[b + OVERLAY_F_G0];
        const h = slab.f[b + OVERLAY_F_G3] - slab.f[b + OVERLAY_F_G1];
        const minX = anchorX - w * 0.5;
        const minY = anchorY - h * 0.5;
        const dashed = slab.flags[i] & OVERLAY_FLAG_DASH;
        drawAabbStyle(ctx, minX, minY, minX + w, minY + h, fill, stroke, slab.f[b + OVERLAY_F_LINE_WIDTH], dashed ? slab.f[b + OVERLAY_F_DASH_A] : NaN, dashed ? slab.f[b + OVERLAY_F_DASH_B] : NaN);
    }
}
function drawAimSegmentAt(ctx, slab, i) {
    const b = i * OVERLAY_F_STRIDE;
    const x1 = slab.f[b + OVERLAY_F_G0];
    const y1 = slab.f[b + OVERLAY_F_G1];
    const x2 = slab.f[b + OVERLAY_F_G2];
    const y2 = slab.f[b + OVERLAY_F_G3];
    const color = overlayStrokeCss(slab, i);
    const lineWidth = slab.f[b + OVERLAY_F_LINE_WIDTH];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (lengthXY(dx, dy) < 0.5) return;
    ctx.save();
    if (slab.flags[i] & OVERLAY_FLAG_GLOW) {
        ctx.shadowColor = OVERLAY_DRAG_GLOW_CSS[overlayHueIndex(slab.f[b + OVERLAY_F_HUE])];
        ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    strokeSegment(ctx, x1, y1, x2, y2);
    if (slab.flags[i] & OVERLAY_FLAG_ARROWHEAD) {
        normalizeXYInto(dx, dy);
        drawArrowHeadAt(ctx, x2, y2, ENGINE_F32[M_OUT_NX], ENGINE_F32[M_OUT_NY], color, 8, 5);
    }
    ctx.restore();
}
export function drawOverlayCommands(ctx, slab, viewport) {
    if (!slab.count) return;
    ctx.save();
    for (let i = 0; i < slab.count; i++) {
        const kind = slab.kind[i];
        const b = i * OVERLAY_F_STRIDE;
        if (slab.flags[i] & OVERLAY_FLAG_CACHE) {
            const worldX = slab.f[b + OVERLAY_F_ANCHOR_X];
            const worldY = slab.f[b + OVERLAY_F_ANCHOR_Y];
            const worldSpan = slab.f[b + OVERLAY_F_WORLD_SPAN];
            drawCachedOverlayGlyph(ctx, worldX, worldY, viewport, slab.cacheRenderKey[i], slab.cacheCustomKey[i], worldSpan, (bakeCtx, bakeAnchorX, bakeAnchorY) => bakeOverlayCommandAt(bakeCtx, bakeAnchorX, bakeAnchorY, slab, i));
            continue;
        }
        const stroke = overlayStrokeCss(slab, i);
        const fill = overlayFillCss(slab, i);
        if (kind === OVERLAY_CMD_AABB) {
            const dashed = slab.flags[i] & OVERLAY_FLAG_DASH;
            drawAabbStyle(ctx, slab.f[b + OVERLAY_F_G0], slab.f[b + OVERLAY_F_G1], slab.f[b + OVERLAY_F_G2], slab.f[b + OVERLAY_F_G3], fill, stroke, slab.f[b + OVERLAY_F_LINE_WIDTH], dashed ? slab.f[b + OVERLAY_F_DASH_A] : NaN, dashed ? slab.f[b + OVERLAY_F_DASH_B] : NaN);
            continue;
        }
        if (kind === OVERLAY_CMD_CIRCLE_STROKE) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = slab.f[b + OVERLAY_F_LINE_WIDTH];
            const dashed = applyOverlayDash(ctx, slab, i);
            strokeCircle(ctx, slab.f[b + OVERLAY_F_G0], slab.f[b + OVERLAY_F_G1], slab.f[b + OVERLAY_F_G2]);
            if (dashed) ctx.setLineDash([]);
            continue;
        }
        if (kind === OVERLAY_CMD_CIRCLE_FILL_STROKE) {
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = slab.f[b + OVERLAY_F_LINE_WIDTH];
            fillStrokeCircle(ctx, slab.f[b + OVERLAY_F_G0], slab.f[b + OVERLAY_F_G1], slab.f[b + OVERLAY_F_G2]);
            continue;
        }
        if (kind === OVERLAY_CMD_SEGMENT) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = slab.f[b + OVERLAY_F_LINE_WIDTH];
            if (slab.flags[i] & OVERLAY_FLAG_LINECAP_ROUND) ctx.lineCap = "round";
            const dashed = applyOverlayDash(ctx, slab, i);
            strokeSegment(ctx, slab.f[b + OVERLAY_F_G0], slab.f[b + OVERLAY_F_G1], slab.f[b + OVERLAY_F_G2], slab.f[b + OVERLAY_F_G3]);
            if (dashed) ctx.setLineDash([]);
            if (slab.flags[i] & OVERLAY_FLAG_LINECAP_ROUND) ctx.lineCap = "butt";
            continue;
        }
        if (kind === OVERLAY_CMD_POLYLINE) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = slab.f[b + OVERLAY_F_LINE_WIDTH];
            const dashed = applyOverlayDash(ctx, slab, i);
            strokeOpenPolylineF32(ctx, slab.poly.buf, slab.polyBase[i], slab.polyCount[i]);
            if (dashed) ctx.setLineDash([]);
            continue;
        }
        if (kind === OVERLAY_CMD_AIM_SEGMENT) drawAimSegmentAt(ctx, slab, i);
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
export const SPHERE_LON_BANDS = 6;
export const SPHERE_LAT_BANDS = 5;
export function drawFlatSphereDisc(ctx, prop, radius) {
    if (!(wallChunkPipeline?._wallChunkReady && wallChunkPipeline._wallChunkCapCanvas && fillCapPathWithChunkTexture(ctx, prop.x, prop.y))) return;
    traceCircle(ctx, prop.x, prop.y, radius);
    ctx.closePath();
    ctx.fill();
}
export function drawSphere(ctx, prop, viewport) {
    if (!(wallChunkPipeline?._wallChunkReady && wallChunkPipeline._wallChunkCapCanvas)) return;
    const radius = prop.radius;
    const qw = prop.rollQw ?? 1;
    const qx = prop.rollQx ?? 0;
    const qy = prop.rollQy ?? 0;
    const qz = prop.rollQz ?? 0;
    buildSphereMesh(radius, SPHERE_LAT_BANDS, SPHERE_LON_BANDS, qw, qx, qy, qz);
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
            drawSphereFaceTextured(ctx, prop, viewport, sSphereFaceI0[f], sSphereFaceI1[f], sSphereFaceI2[f]);
        }
    };
    drawPass(sSphereBackOrder, backN);
    drawPass(sSphereFrontOrder, frontN);
}
export const DEFAULT_PROP_HEIGHT = 14;
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
    if (!prop.wallChunkProfileId) return 0;
    const profileId = prop.wallChunkProfileId;
    const rev = getSurfaceProfileRevision(profileId);
    const readyBit = prop._wallChunkTextureReady ? 1 : 0;
    const footprint = propShapeFootprintId(prop) | 0;
    return mixHash4(hashString(profileId), prop.wallChunkHeightPx | 0, rev | 0, (footprint << 1) ^ readyBit);
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
function drawWallChunkContour(ctx, prop, viewport, flatPresentation, localVerts) {
    if (!localVerts || localVerts.length < 6) return;
    if (flatPresentation) {
        drawFlatWallChunkCap(ctx, prop, localVerts);
        return;
    }
    drawWallChunkTextured(ctx, prop, viewport, localVerts);
}
export function createWallChunkDraw() {
    return (ctx, prop, viewport, flatPresentation) => {
        const outline = prop.drawOutline;
        if (outline) {
            drawWallChunkContour(ctx, prop, viewport, flatPresentation, outline);
            return;
        }
        const parts = prop.collisionParts;
        if (parts?.length > 1) {
            for (let i = 0; i < parts.length; i++) {
                const verts = parts[i].vertices;
                if (verts?.length >= 6) drawWallChunkContour(ctx, prop, viewport, flatPresentation, verts);
            }
            return;
        }
        drawWallChunkContour(ctx, prop, viewport, flatPresentation, prop.shape?.vertices);
    };
}
function parallelInsertionSort(kinds, baseIndices, depths, eids, start, end) {
    for (let i = start + 1; i <= end; i++) {
        const keyKind = kinds[i];
        const keyBaseIndex = baseIndices[i];
        const keyDepth = depths[i];
        const keyEid = eids[i];
        let j = i - 1;
        while (j >= start && depths[j] < keyDepth) {
            kinds[j + 1] = kinds[j];
            baseIndices[j + 1] = baseIndices[j];
            depths[j + 1] = depths[j];
            eids[j + 1] = eids[j];
            j--;
        }
        kinds[j + 1] = keyKind;
        baseIndices[j + 1] = keyBaseIndex;
        depths[j + 1] = keyDepth;
        eids[j + 1] = keyEid;
    }
}
function heapify(kinds, baseIndices, depths, eids, n, i) {
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
        const tempEid = eids[root];
        eids[root] = eids[smallest];
        eids[smallest] = tempEid;
        root = smallest;
    }
}
function parallelHeapSort(kinds, baseIndices, depths, eids, n) {
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(kinds, baseIndices, depths, eids, n, i);
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
        const tempEid = eids[0];
        eids[0] = eids[i];
        eids[i] = tempEid;
        heapify(kinds, baseIndices, depths, eids, i, 0);
    }
}
export class VisibleDrawQueue {
    constructor(initialCapacity = 1024) {
        this.length = 0;
        this.kinds = new Uint8Array(initialCapacity);
        this.baseIndices = new Int32Array(initialCapacity);
        this.depths = new Float32Array(initialCapacity);
        this.eids = new Int32Array(initialCapacity);
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
        const nextEids = new Int32Array(nextCapacity);
        nextEids.set(this.eids);
        this.eids = nextEids;
    }
    push(kind, baseIndex, eid, distSq) {
        this.ensureCapacity(this.length + 1);
        const i = this.length;
        this.kinds[i] = kind;
        this.baseIndices[i] = baseIndex;
        this.depths[i] = distSq;
        this.eids[i] = eid;
        this.length++;
    }
    sort() {
        const n = this.length;
        if (n <= 1) return;
        if (n <= 32) parallelInsertionSort(this.kinds, this.baseIndices, this.depths, this.eids, 0, n - 1);
        else parallelHeapSort(this.kinds, this.baseIndices, this.depths, this.eids, n);
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
        const cx = data[base + VOXEL_FACE_CX];
        const cy = data[base + VOXEL_FACE_CY];
        const outX = data[base + VOXEL_FACE_OUT_X];
        const outY = data[base + VOXEL_FACE_OUT_Y];
        if (!isOutwardFaceTowardViewer(cx, cy, outX, outY, viewerX, viewerY)) continue;
        const viewX = cx - viewerX;
        const viewY = cy - viewerY;
        const distSq = viewX * viewX + viewY * viewY;
        outQueue.push(DRAW_KIND_VOXEL, base, -1, distSq);
    }
}
export function getVoxelWallFaceData() {
    return sGeomCache.faces.data;
}
export function drawProjectedVoxelWallFaceFlat(ctx, baseIndex, viewport, state) {
    const data = sGeomCache.faces.data;
    const x1 = data[baseIndex + VOXEL_FACE_X1];
    const y1 = data[baseIndex + VOXEL_FACE_Y1];
    const x2 = data[baseIndex + VOXEL_FACE_X2];
    const y2 = data[baseIndex + VOXEL_FACE_Y2];
    drawProjectedWallFaceScalars(ctx, x1, y1, x2, y2, viewport, state);
}
export function invalidateStaticGridWallDrawCache() {
    sGeomCache.wallGridRevision = -1;
    sGeomCache.faces.clear();
}
const sBoxCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, boxes: new StrideFloatList(RAIL_BOX_STRIDE) };
function railWallBoxTowardViewerFlat(data, base, viewerX, viewerY) {
    const minX = data[base + RAIL_BOX_MIN_X];
    const maxX = data[base + RAIL_BOX_MAX_X];
    const minY = data[base + RAIL_BOX_MIN_Y];
    const maxY = data[base + RAIL_BOX_MAX_Y];
    if (viewerX >= minX && viewerX <= maxX && viewerY >= minY && viewerY <= maxY) return true;
    const innerP1x = data[base + RAIL_BOX_INNER_P1X];
    const innerP1y = data[base + RAIL_BOX_INNER_P1Y];
    const innerP2x = data[base + RAIL_BOX_INNER_P2X];
    const innerP2y = data[base + RAIL_BOX_INNER_P2Y];
    const outerP1x = data[base + RAIL_BOX_OUTER_P1X];
    const outerP1y = data[base + RAIL_BOX_OUTER_P1Y];
    const outerP2x = data[base + RAIL_BOX_OUTER_P2X];
    const outerP2y = data[base + RAIL_BOX_OUTER_P2Y];
    const inwardX = data[base + RAIL_BOX_INWARD_X];
    const inwardY = data[base + RAIL_BOX_INWARD_Y];
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
        const cx = data[base + RAIL_BOX_CX];
        const cy = data[base + RAIL_BOX_CY];
        const viewX = cx - viewerX;
        const viewY = cy - viewerY;
        const distSq = viewX * viewX + viewY * viewY;
        outQueue.push(DRAW_KIND_RAIL, base, -1, distSq);
    }
}
export function getRailWallBoxData() {
    return sBoxCache.boxes.data;
}
export function drawProjectedGridEdgeRailFlat(ctx, baseIndex, viewport, state, skipWallCaps = false) {
    const data = sBoxCache.boxes.data;
    const base = baseIndex;
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const innerP1x = data[base + RAIL_BOX_INNER_P1X];
    const innerP1y = data[base + RAIL_BOX_INNER_P1Y];
    const innerP2x = data[base + RAIL_BOX_INNER_P2X];
    const innerP2y = data[base + RAIL_BOX_INNER_P2Y];
    const outerP1x = data[base + RAIL_BOX_OUTER_P1X];
    const outerP1y = data[base + RAIL_BOX_OUTER_P1Y];
    const outerP2x = data[base + RAIL_BOX_OUTER_P2X];
    const outerP2y = data[base + RAIL_BOX_OUTER_P2Y];
    const inwardX = data[base + RAIL_BOX_INWARD_X];
    const inwardY = data[base + RAIL_BOX_INWARD_Y];
    if (isOutwardFaceTowardViewer((innerP1x + innerP2x) * 0.5, (innerP1y + innerP2y) * 0.5, inwardX, inwardY, viewerX, viewerY)) {
        wallFaceI32[WF_I_ATLAS_FACE_KIND] = WALL_ATLAS_FACE_INNER;
        drawProjectedWallFaceScalars(ctx, innerP1x, innerP1y, innerP2x, innerP2y, viewport, state);
    }
    if (isOutwardFaceTowardViewer((outerP1x + outerP2x) * 0.5, (outerP1y + outerP2y) * 0.5, -inwardX, -inwardY, viewerX, viewerY)) {
        wallFaceI32[WF_I_ATLAS_FACE_KIND] = WALL_ATLAS_FACE_OUTER;
        drawProjectedWallFaceScalars(ctx, outerP1x, outerP1y, outerP2x, outerP2y, viewport, state);
    }
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        if (isOutwardFaceTowardViewer((outerP1x + innerP1x) * 0.5, (outerP1y + innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) {
            wallFaceI32[WF_I_ATLAS_FACE_KIND] = WALL_ATLAS_FACE_END0;
            drawProjectedWallFaceScalars(ctx, outerP1x, outerP1y, innerP1x, innerP1y, viewport, state);
        }
        if (isOutwardFaceTowardViewer((innerP2x + outerP2x) * 0.5, (innerP2y + outerP2y) * 0.5, tx, ty, viewerX, viewerY)) {
            wallFaceI32[WF_I_ATLAS_FACE_KIND] = WALL_ATLAS_FACE_END1;
            drawProjectedWallFaceScalars(ctx, innerP2x, innerP2y, outerP2x, outerP2y, viewport, state);
        }
    }
    wallFaceI32[WF_I_ATLAS_FACE_KIND] = WALL_ATLAS_FACE_NONE;
    if (!skipWallCaps) drawProjectedRailWallCapFlat(ctx, data, base, viewport, state);
}
export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.boxes.clear();
}
/**
 * Projects wall faces via radial elevation projection and samples baked atlases from WorldSurfaceEngine.
 * Vertical bands: projectWorldPoint. Horizontal caps: box top ring + per-corner chunk UV.
 */
function wallDrawMemoSlot() {
    return (wallFaceI32[WF_I_GRID_IDX] * 4 + wallFaceI32[WF_I_GRID_SIDE]) * 5 + wallFaceI32[WF_I_ATLAS_FACE_KIND];
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
function resolveWallFaceAtlasScalars(x1, y1, x2, y2, state) {
    const worldSurfaces = state.worldSurfaces;
    const wallHeight = wallFaceF32[WF_F_WALL_HEIGHT];
    const wallBaseZ = wallFaceF32[WF_F_WALL_BASE_Z];
    const wallCapHeight = wallFaceF32[WF_F_WALL_CAP_HEIGHT];
    const settings = worldSurfaces.settings;
    const profileId = resolveSurfaceProfileId(state.obstacleGrid, SURFACE_MATERIAL_OWNER.WallFace, worldSurfaces.activeSurfaceProfileId, settings.cellsPerChunk, wallFaceI32[WF_I_GRID_IDX], wallFaceI32[WF_I_GRID_SIDE], wallFaceI32[WF_I_IS_EDGE_RAIL]);
    const seed = worldSurfaces.worldSurfaceSeed;
    const wallHeightKey = resolveWallCapHeightPx(wallCapHeight, settings);
    const canUseSideCache = !!(worldSurfaces.cacheKeys && worldSurfaces.surfaceSpace && worldSurfaces.worldSurfaceSeed !== undefined);
    let row = WALL_FACE_ATLAS_MISS;
    if (canUseSideCache) {
        syncWallFaceDrawMemoRevision(state.obstacleGrid);
        row = wallFaceMemoGetOrAlloc(wallDrawMemoSlot());
    }
    const slab = wallFaceDrawMemoSlab;
    let canvases = null;
    let cacheHit = false;
    let rev = 0;
    let profileHash = 0;
    if (canUseSideCache && row >= 0) {
        const space = worldSurfaces.surfaceSpace;
        WALL_ATLAS_WRAP[0] = x1;
        WALL_ATLAS_WRAP[1] = y1;
        WALL_ATLAS_WRAP[2] = x2;
        WALL_ATLAS_WRAP[3] = y2;
        space.writeWallAtlasWrap(WALL_ATLAS_WRAP, 0);
        const key = worldSurfaces.cacheKeys.wallAtlasCacheKey(seed, profileId, wallHeightKey);
        rev = getSurfaceProfileRevision(profileId);
        profileHash = hashString(profileId) | 0;
        canvases = slab.handles[row];
        if (canvases && slab.atlasRev[row] === rev && slab.atlasSeed[row] === seed && slab.atlasWallHeightKey[row] === wallHeightKey && slab.atlasProfileHash[row] === profileHash && worldSurfaces.surfaceCache.get(key) === canvases) cacheHit = true;
    }
    if (!cacheHit) {
        WALL_ATLAS_WRAP[0] = x1;
        WALL_ATLAS_WRAP[1] = y1;
        WALL_ATLAS_WRAP[2] = x2;
        WALL_ATLAS_WRAP[3] = y2;
        worldSurfaces.surfaceSpace.writeWallAtlasWrap(WALL_ATLAS_WRAP, 0);
        canvases = worldSurfaces.getOrEnsureWallAtlas(profileId, wallCapHeight);
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
    if (!canvas) return WALL_FACE_ATLAS_MISS;
    if (row < 0) {
        syncWallFaceDrawMemoRevision(state.obstacleGrid);
        row = wallFaceMemoGetOrAlloc(wallDrawMemoSlot());
        const space = worldSurfaces.surfaceSpace;
        const b = space._boundsBank;
        const o = SS_POINTS;
        rev = getSurfaceProfileRevision(profileId);
        profileHash = hashString(profileId) | 0;
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
function resolveWallFaceSubdiv(row, viewport, grid, settings) {
    const camKey = Math.round(viewport.cameraHeight);
    const perspKey = Math.round(viewport.perspectiveStrength * 100);
    syncWallFaceDrawMemoRevision(grid);
    const slab = wallFaceDrawMemoSlab;
    if (slab.camKey[row] === camKey && slab.perspKey[row] === perspKey && slab.subdivX[row] > 0) return row;
    slab.camKey[row] = camKey;
    slab.perspKey[row] = perspKey;
    return computeWallFaceSubdivInto(row, settings, viewport);
}
function drawFaceTextureScalars(ctx, x1, y1, x2, y2, botBuf, botO, topBuf, topO, viewport, state) {
    const row = resolveWallFaceAtlasScalars(x1, y1, x2, y2, state);
    if (row === WALL_FACE_ATLAS_MISS) return;
    const subdivRow = resolveWallFaceSubdiv(row, viewport, state.obstacleGrid, state.worldSurfaces.settings);
    if (subdivRow === WALL_FACE_SUBDIV_NONE) return;
    blitWallFaceSubdiv(ctx, botBuf, botO, topBuf, topO, subdivRow, viewport);
}
export function drawProjectedWallFaceScalars(ctx, x1, y1, x2, y2, viewport, state) {
    if (!state.worldSurfaces) return;
    const wallHeight = wallFaceF32[WF_F_WALL_HEIGHT];
    const wallBaseZ = wallFaceF32[WF_F_WALL_BASE_Z];
    const topZ = wallBaseZ + wallHeight;
    projectWallFaceBandInto(ENGINE_F32, R_FACE_BAND_BOT, x1, y1, x2, y2, wallBaseZ, viewport);
    projectWallFaceBandInto(ENGINE_F32, R_FACE_BAND_TOP, x1, y1, x2, y2, topZ, viewport);
    traceProjectedFaceBand(ctx, ENGINE_F32, R_FACE_BAND_BOT, ENGINE_F32, R_FACE_BAND_TOP);
    ctx.save();
    ctx.clip();
    drawFaceTextureScalars(ctx, x1, y1, x2, y2, ENGINE_F32, R_FACE_BAND_BOT, ENGINE_F32, R_FACE_BAND_TOP, viewport, state);
    ctx.restore();
}
export function projectRailWallTopCornersIntoFlat(out8, data, base, viewport) {
    const z = data[base + RAIL_BOX_WALL_CAP_HEIGHT];
    projectWorldQuad(out8, 0, data[base + RAIL_BOX_OUTER_P1X], data[base + RAIL_BOX_OUTER_P1Y], data[base + RAIL_BOX_OUTER_P2X], data[base + RAIL_BOX_OUTER_P2Y], data[base + RAIL_BOX_INNER_P2X], data[base + RAIL_BOX_INNER_P2Y], data[base + RAIL_BOX_INNER_P1X], data[base + RAIL_BOX_INNER_P1Y], z, viewport);
    return out8;
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
export function drawProjectedRailWallCapFlat(ctx, data, base, viewport, state) {
    const worldSurfaces = state.worldSurfaces;
    if (!worldSurfaces) return;
    projectRailWallTopCornersIntoFlat(rCapCorners, data, base, viewport);
    flatRailWallCapUvCornersIntoFlat(rCapUv, state.obstacleGrid, data, base);
    const wallCapHeight = data[base + RAIL_BOX_WALL_CAP_HEIGHT];
    const capCanvas = worldSurfaces.fillHorizontalCapDrawSampleIntoFlat(rCapUv, wallCapHeight, state, rCapSrc);
    if (!capCanvas) return;
    blitHorizontalCapSampleFlat(ctx, rCapCorners, rCapSrc, capCanvas);
}
const match3d = (p) => p.strategy?.renderMode === PROP_RENDER_MODE_3D;
function bindWallFaceScratchFlat(kind, baseIndex) {
    if (kind === DRAW_KIND_RAIL) writeWallFaceFromRailBox(getRailWallBoxData(), baseIndex);
    else if (kind === DRAW_KIND_VOXEL) writeWallFaceFromVoxelFace(getVoxelWallFaceData(), baseIndex);
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
    }
    _appendVisible3dProps(state, viewport) {
        const count = state.entityRegistry.queryViewTier(state.spatialFrame, VIEW_TIER_PROPS, "3d", match3d);
        const ids = state.entityRegistry.borrowedQueryIds("3d");
        for (let i = 0; i < count; i++) {
            const eid = ids[i];
            const p = state.entityRegistry.getRef(eid);
            if (!p) continue;
            const distSq = (p.x - viewport.x) ** 2 + (p.y - viewport.y) ** 2;
            this.visibleDrawQueue.push(DRAW_KIND_PROP, 0, eid, distSq);
        }
        state.fractureEngine.debris.appendVisibleProps(this.visibleDrawQueue, viewport, DRAW_KIND_PROP);
    }
    _appendVisibleStaticGridWalls(state, viewport) {
        collectStaticGridWallDrawables(state.obstacleGrid, viewport, this.visibleDrawQueue);
        collectStaticGridEdgeRailDrawables(state.obstacleGrid, viewport, this.visibleDrawQueue);
    }
    draw3DBuildings(ctx, state, viewport, skipWalls = false, flatProps = false, radialSpheres = false, skipWallCaps = false) {
        const q = this.visibleDrawQueue;
        q.clear();
        this._appendVisible3dProps(state, viewport);
        if (!skipWalls) this._appendVisibleStaticGridWalls(state, viewport);
        q.sort();
        for (let i = 0; i < q.length; i++) {
            const kind = q.kinds[i];
            const baseIndex = q.baseIndices[i];
            if (kind === DRAW_KIND_PROP) this._drawProp(ctx, entityRefs[q.eids[i]], viewport, state, flatProps, radialSpheres);
            else if (kind === DRAW_KIND_VOXEL) {
                bindWallFaceScratchFlat(DRAW_KIND_VOXEL, baseIndex);
                drawProjectedVoxelWallFaceFlat(ctx, baseIndex, viewport, state);
            } else if (kind === DRAW_KIND_RAIL) {
                bindWallFaceScratchFlat(DRAW_KIND_RAIL, baseIndex);
                drawProjectedGridEdgeRailFlat(ctx, baseIndex, viewport, state, skipWallCaps);
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
export function edgeSegmentOutsideCircle(x1, y1, x2, y2, centerX, centerY, rangeSq) {
    aabbFromTwoPointsF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, x1, y1, x2, y2);
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
function resolveLightZ(obstacleGrid, lightHeightCells, lightZ) {
    if (lightZ != null) return lightZ;
    return lightHeightCells * obstacleGrid.cellSize;
}
export function composeLosShadowMask(overlayCtx, canvasW, canvasH, viewport, obstacleGrid, visionTiles = LOS_SHADOW_VISION_TILES_DEFAULT, lightHeightCells = LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT, overlayAlpha = LOS_SHADOW_OVERLAY_ALPHA, lightZ = null) {
    const resolvedLightZ = resolveLightZ(obstacleGrid, lightHeightCells, lightZ);
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
        forEachLosShadowQuadInRange(sEdgeScratch, lightX, lightY, range, resolvedLightZ, viewport, rLosQuad, (flatVerts, vertCount) => {
            traceWoundFlatQuad(pathCtx, flatVerts, vertCount);
            hasShadows = true;
        });
        return hasShadows;
    });
}
export function drawLosShadowOverlay(ctx, viewport, obstacleGrid, visionTiles = LOS_SHADOW_VISION_TILES_DEFAULT, lightHeightCells = LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT, overlayAlpha = LOS_SHADOW_OVERLAY_ALPHA, lightZ = null) {
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    const overlayCtx = ensureOverlayBuffer(canvasW, canvasH);
    composeLosShadowMask(overlayCtx, canvasW, canvasH, viewport, obstacleGrid, visionTiles, lightHeightCells, overlayAlpha, lightZ);
    blitMaskOverlay(ctx, sOverlayCanvas);
}
const sRailShadowBoxes = new StrideFloatList(RAIL_BOX_STRIDE);
function pushRailWallBoxCapShadowEdges(data, index, out) {
    const base = index * RAIL_BOX_STRIDE;
    const wallTopZ = data[base + RAIL_BOX_WALL_CAP_HEIGHT];
    const inwardX = data[base + RAIL_BOX_INWARD_X];
    const inwardY = data[base + RAIL_BOX_INWARD_Y];
    const innerP1x = data[base + RAIL_BOX_INNER_P1X];
    const innerP1y = data[base + RAIL_BOX_INNER_P1Y];
    const innerP2x = data[base + RAIL_BOX_INNER_P2X];
    const innerP2y = data[base + RAIL_BOX_INNER_P2Y];
    const outerP1x = data[base + RAIL_BOX_OUTER_P1X];
    const outerP1y = data[base + RAIL_BOX_OUTER_P1Y];
    const outerP2x = data[base + RAIL_BOX_OUTER_P2X];
    const outerP2y = data[base + RAIL_BOX_OUTER_P2Y];
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
