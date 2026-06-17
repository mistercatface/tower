import { createOffscreenCanvas, resizeOffscreenCanvas } from "../../Canvas/offscreenCanvas.js";
import { blitMaskOverlay, addMaskPathFill, cutOutRadialSoftDisc, fillMaskBase } from "../../Canvas/maskCompositor.js";
import { traceWoundFlatQuad } from "../../Canvas/CanvasPath.js";
import { collectExposedWallEdgesInAabb } from "../../Spatial/grid/gridCellTopology.js";
import { collectRailWallShadowEdgesInAabb } from "../../World/wallGridBake.js";
import { elevationCameraFromViewport } from "../../Spatial/iso/ElevationCamera.js";
import { LIBRARY_DEFAULT_CAMERA_HEIGHT } from "../../Spatial/iso/perspectiveDefaults.js";
import { LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT, LOS_SHADOW_OVERLAY_ALPHA, LOS_SHADOW_VISION_TILES_DEFAULT } from "./losShadowDefaults.js";
import { forEachLosShadowQuadInRange } from "./losShadowEdges.js";
const sEdgeScratch = [];
const sQuadScratch = new Float32Array(8);
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
function resolveShadowCamera(viewport, options) {
    return options.camera ?? elevationCameraFromViewport(viewport, options.cameraHeight ?? LIBRARY_DEFAULT_CAMERA_HEIGHT);
}
/**
 * @param {CanvasRenderingContext2D} overlayCtx
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {{ visionTiles?: number, lightZ?: number, lightHeightCells?: number, overlayAlpha?: number, camera?: import("../../Spatial/iso/ElevationCamera.js").ElevationCamera, cameraHeight?: number }} [options]
 */
export function composeLosShadowMask(overlayCtx, canvasW, canvasH, viewport, obstacleGrid, options = {}) {
    const visionTiles = options.visionTiles ?? LOS_SHADOW_VISION_TILES_DEFAULT;
    const lightZ = resolveLightZ(obstacleGrid, options);
    const overlayAlpha = options.overlayAlpha ?? LOS_SHADOW_OVERLAY_ALPHA;
    const camera = resolveShadowCamera(viewport, options);
    const lightX = viewport.x;
    const lightY = viewport.y;
    const range = visionTiles * obstacleGrid.cellSize;
    const screenRange = range * (viewport.zoom ?? 1);
    const screenLight = viewport.worldToScreen(lightX, lightY);
    collectExposedWallEdgesInAabb(obstacleGrid, lightX - range, lightY - range, lightX + range, lightY + range, sEdgeScratch);
    collectRailWallShadowEdgesInAabb(obstacleGrid, lightX - range, lightY - range, lightX + range, lightY + range, sEdgeScratch);
    fillMaskBase(overlayCtx, canvasW, canvasH, `rgba(0,0,0,${overlayAlpha})`);
    cutOutRadialSoftDisc(overlayCtx, screenLight.x, screenLight.y, screenRange);
    addMaskPathFill(overlayCtx, `rgba(0,0,0,${overlayAlpha})`, (pathCtx) => {
        let hasShadows = false;
        forEachLosShadowQuadInRange(sEdgeScratch, lightX, lightY, range, lightZ, viewport, camera, sQuadScratch, (flatVerts, vertCount) => {
            traceWoundFlatQuad(pathCtx, flatVerts, vertCount);
            hasShadows = true;
        });
        return hasShadows;
    });
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {{ visionTiles?: number, lightZ?: number, lightHeightCells?: number, overlayAlpha?: number, camera?: import("../../Spatial/iso/ElevationCamera.js").ElevationCamera, cameraHeight?: number }} [options]
 */
export function drawLosShadowOverlay(ctx, viewport, obstacleGrid, options = {}) {
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    const overlayCtx = ensureOverlayBuffer(canvasW, canvasH);
    composeLosShadowMask(overlayCtx, canvasW, canvasH, viewport, obstacleGrid, options);
    blitMaskOverlay(ctx, sOverlayCanvas);
}
