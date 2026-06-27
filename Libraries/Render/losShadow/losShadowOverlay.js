import { createOffscreenCanvas, resizeOffscreenCanvas } from "../../Canvas/offscreenCanvas.js";
import { blitMaskOverlay, addMaskPathFill, cutOutRadialSoftDisc, fillMaskBase } from "../../Canvas/maskCompositor.js";
import { traceWoundFlatQuad } from "../../Canvas/CanvasPath.js";
import { centerReachAabbInto, createAabb } from "../../Spatial/bounds.js";
import { collectExposedWallEdgesInAabb } from "../../Spatial/grid/gridCellTopology.js";
import { LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT, LOS_SHADOW_OVERLAY_ALPHA, LOS_SHADOW_VISION_TILES_DEFAULT } from "./losShadowDefaults.js";
import { forEachLosShadowQuadInRange } from "./losShadowEdges.js";
import { collectRailWallShadowEdgesInAabb } from "./railWallShadowEdges.js";
const sEdgeScratch = [];
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
