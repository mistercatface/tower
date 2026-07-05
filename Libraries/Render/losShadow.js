import { aabbFromTwoPointsInto, createAabb, distanceSqToAabb, centerReachAabbInto } from "../Math/math.js";
import { projectWallShadowQuadScreenInto, collectExposedWallEdgesInAabb } from "../Spatial/spatial.js";
import { createOffscreenCanvas, resizeOffscreenCanvas } from "../Canvas/canvas.js";
import { blitMaskOverlay, addMaskPathFill, cutOutRadialSoftDisc, fillMaskBase } from "../Canvas/canvas.js";
import { traceWoundFlatQuad } from "../Canvas/canvas.js";
import { collectRailWallBoxesInAabb, RAIL_BOX, RAIL_BOX_STRIDE } from "../World/wallGridBake.js";
import { StrideFloatList } from "../World/StrideFloatList.js";
// --- MERGED FROM losShadowDefaults.js ---
/** Default omnidirectional vision radius in grid tiles. */
export const LOS_SHADOW_VISION_TILES_DEFAULT = 16;
/** Viewer height above floor for shadow extrusion, in cell heights (ground-plane light). */
export const LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT = 1;
/** Alpha of the dark overlay outside vision. */
export const LOS_SHADOW_OVERLAY_ALPHA = 0.82;
// --- MERGED FROM EdgeList.js ---
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
// --- MERGED FROM losShadowEdges.js ---
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
// --- MERGED FROM losShadowOverlay.js ---
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
// --- MERGED FROM railWallShadowEdges.js ---
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
