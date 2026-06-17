import { createOffscreenCanvas, resizeOffscreenCanvas } from "../../Canvas/offscreenCanvas.js";
import { elevationCameraFromViewport } from "../../Spatial/iso/ElevationCamera.js";
import { LIBRARY_DEFAULT_CAMERA_HEIGHT } from "../../Spatial/iso/perspectiveDefaults.js";
import {
    LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT,
    LOS_SHADOW_OVERLAY_ALPHA,
    LOS_SHADOW_VISION_TILES_DEFAULT,
} from "./losShadowDefaults.js";
import { appendShadowQuadToPath } from "./losShadowMath.js";
import { collectLosShadowEdges, forEachLosShadowQuadInRange } from "./losShadowEdges.js";
const sEdgeCache = {
    grid: null,
    wallGridRevision: -1,
    cols: 0,
    rows: 0,
    edges: [],
};
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
function syncEdgeCache(grid) {
    if (sEdgeCache.grid === grid && sEdgeCache.wallGridRevision === grid.wallGridRevision && sEdgeCache.cols === grid.cols && sEdgeCache.rows === grid.rows) return sEdgeCache.edges;
    collectLosShadowEdges(grid, sEdgeCache.edges);
    sEdgeCache.grid = grid;
    sEdgeCache.wallGridRevision = grid.wallGridRevision;
    sEdgeCache.cols = grid.cols;
    sEdgeCache.rows = grid.rows;
    return sEdgeCache.edges;
}
export function invalidateLosShadowEdgeCache() {
    sEdgeCache.wallGridRevision = -1;
    sEdgeCache.edges.length = 0;
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
    const edges = syncEdgeCache(obstacleGrid);
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.globalCompositeOperation = "source-over";
    overlayCtx.globalAlpha = 1;
    overlayCtx.clearRect(0, 0, canvasW, canvasH);
    overlayCtx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
    overlayCtx.fillRect(0, 0, canvasW, canvasH);
    overlayCtx.globalCompositeOperation = "destination-out";
    const gradient = overlayCtx.createRadialGradient(screenLight.x, screenLight.y, 0, screenLight.x, screenLight.y, screenRange);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.92, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    overlayCtx.fillStyle = gradient;
    overlayCtx.beginPath();
    overlayCtx.arc(screenLight.x, screenLight.y, screenRange, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.globalCompositeOperation = "source-over";
    overlayCtx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
    overlayCtx.beginPath();
    let hasShadows = false;
    forEachLosShadowQuadInRange(edges, lightX, lightY, range, lightZ, viewport, camera, sQuadScratch, (flatVerts, vertCount) => {
        appendShadowQuadToPath(overlayCtx, flatVerts, vertCount);
        hasShadows = true;
    });
    if (hasShadows) overlayCtx.fill();
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
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(sOverlayCanvas, 0, 0);
    ctx.restore();
}
