import { createOffscreenCanvas, fillCircle, traceSegment, fillClosedPolygon } from "../Canvas/canvas.js";
import { gridNavCacheKey, floorOccupancyStampDrawCacheKey } from "../Spatial/spatial.js";
import { BeltPacked } from "../Spatial/belts.js";
import { findNearestOpenCellIdx, buildNavReachableMaskFromSeed } from "./navigation.js";
export const NAV_PATH_DEBUG_MODE = { OFF: "off", ALL: "hpa", REACHABLE: "reachable" };
const PATH_DEBUG_BLOCKED_FILL = "rgba(244, 67, 54, 0.16)";
const PATH_DEBUG_DIM_FILL = "rgba(120, 128, 140, 0.14)";
const PATH_DEBUG_UNASSIGNED_FILL = "rgba(180, 190, 200, 0.16)";
const PATH_DEBUG_REGION_BORDER = "rgba(255, 255, 255, 0.28)";
const PATH_DEBUG_NODE_FILL = "rgba(0, 229, 255, 0.28)";
const PATH_DEBUG_PORTAL_EXIT_STROKE = "#ff7a2f";
const PATH_DEBUG_PORTAL_ENTRY_STROKE = "#3fa9ff";
function bakeCanvas(width, height) {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return createOffscreenCanvas(w, h);
}
function writeComponentColor(h, data, offset) {
    const a = 0.3024;
    const l = 0.58;
    const hDiv30 = h / 30;
    let k0 = hDiv30 % 12;
    let f0 = l - a * Math.max(-1, Math.min(k0 - 3, 9 - k0, 1));
    let k8 = (8 + hDiv30) % 12;
    let f8 = l - a * Math.max(-1, Math.min(k8 - 3, 9 - k8, 1));
    let k4 = (4 + hDiv30) % 12;
    let f4 = l - a * Math.max(-1, Math.min(k4 - 3, 9 - k4, 1));
    data[offset] = Math.round(f0 * 255);
    data[offset + 1] = Math.round(f8 * 255);
    data[offset + 2] = Math.round(f4 * 255);
    data[offset + 3] = 51; // 0.2 * 255 = 51
}
function cellReachable(idx, reachableMask) {
    return !reachableMask || reachableMask[idx] !== 0;
}
function bakeCellFills(ctx, debugView, reachableMask) {
    const { cols, rows, cellSize, minX, minY } = debugView;
    const cellToComponent = debugView.cellToComponent;
    const blocked = debugView.grid;
    const size = cols * rows;
    if (size <= 0) return;
    const tinyCanvas = createOffscreenCanvas(cols, rows);
    if (!tinyCanvas) return;
    const tinyCtx = tinyCanvas.getContext("2d");
    const imgData = tinyCtx.createImageData(cols, rows);
    const data = imgData.data;
    for (let i = 0; i < size; i++) {
        const offset = i * 4;
        if (blocked[i] !== 0) {
            data[offset] = 244;
            data[offset + 1] = 67;
            data[offset + 2] = 54;
            data[offset + 3] = 41; // 0.16 * 255 = 40.8
        } else if (cellToComponent)
            if (!cellReachable(i, reachableMask)) {
                data[offset] = 120;
                data[offset + 1] = 128;
                data[offset + 2] = 140;
                data[offset + 3] = 36; // 0.14 * 255 = 35.7
            } else {
                const component = cellToComponent[i];
                if (component < 0) {
                    data[offset] = 180;
                    data[offset + 1] = 190;
                    data[offset + 2] = 200;
                    data[offset + 3] = 41; // 0.16 * 255 = 40.8
                } else {
                    const hue = (component * 47 + 90) % 360;
                    writeComponentColor(hue, data, offset);
                }
            }
    }
    tinyCtx.putImageData(imgData, 0, 0);
    const oldSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tinyCanvas, minX, minY, cols * cellSize, rows * cellSize);
    ctx.imageSmoothingEnabled = oldSmoothing;
}
function portalLinkGeometry(debugView, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    const ux = dx / len;
    const uy = dy / len;
    const edgePad = Math.min(debugView.cellSize * 0.5, len * 0.42);
    const headLen = Math.max(12, debugView.cellSize * 0.3);
    const tipX = x1 - ux * edgePad;
    const tipY = y1 - uy * edgePad;
    const shaftEndX = tipX - ux * headLen;
    const shaftEndY = tipY - uy * headLen;
    const startX = x0 + ux * edgePad;
    const startY = y0 + uy * edgePad;
    if (Math.hypot(shaftEndX - startX, shaftEndY - startY) < 4) return null;
    return { startX, startY, shaftEndX, shaftEndY, tipX, tipY, ux, uy, headLen };
}
function fillPortalArrowHead(ctx, tipX, tipY, ux, uy, headLen) {
    const headWidth = headLen * 0.65;
    const tx = -uy;
    const ty = ux;
    const baseCenterX = tipX - ux * headLen;
    const baseCenterY = tipY - uy * headLen;
    const head = [
        { x: tipX, y: tipY },
        { x: baseCenterX + tx * headWidth, y: baseCenterY + ty * headWidth },
        { x: baseCenterX - tx * headWidth, y: baseCenterY - ty * headWidth },
    ];
    ctx.fillStyle = PATH_DEBUG_PORTAL_ENTRY_STROKE;
    fillClosedPolygon(ctx, head);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    traceSegment(ctx, head[0].x, head[0].y, head[1].x, head[1].y);
    traceSegment(ctx, head[1].x, head[1].y, head[2].x, head[2].y);
    traceSegment(ctx, head[2].x, head[2].y, head[0].x, head[0].y);
    ctx.closePath();
    ctx.stroke();
}
function drawPortalEdges(ctx, debugView, grid, reachableMask) {
    const pairs = grid.activePortalPairs;
    const count = grid.activePortalCount;
    if (!pairs || !count) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
        const exitIdx = pairs[i * 2];
        if (reachableMask && !reachableMask[exitIdx]) continue;
        const entryIdx = pairs[i * 2 + 1];
        const x0 = debugView.gridCenterXByIdx(exitIdx);
        const y0 = debugView.gridCenterYByIdx(exitIdx);
        const x1 = debugView.gridCenterXByIdx(entryIdx);
        const y1 = debugView.gridCenterYByIdx(entryIdx);
        const geom = portalLinkGeometry(debugView, x0, y0, x1, y1);
        if (!geom) continue;
        const { startX, startY, shaftEndX, shaftEndY, tipX, tipY, ux, uy, headLen } = geom;
        const grad = ctx.createLinearGradient(startX, startY, tipX, tipY);
        grad.addColorStop(0, PATH_DEBUG_PORTAL_EXIT_STROKE);
        grad.addColorStop(1, PATH_DEBUG_PORTAL_ENTRY_STROKE);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        traceSegment(ctx, startX, startY, shaftEndX, shaftEndY);
        ctx.stroke();
        ctx.setLineDash([]);
        fillPortalArrowHead(ctx, tipX, tipY, ux, uy, headLen);
    }
    ctx.restore();
}
function bakeLayerCanvas(debugView, minX, minY, maxX, maxY, reachableMask, grid, includeVectors) {
    const canvas = bakeCanvas(maxX - minX, maxY - minY);
    if (!canvas || !debugView.grid) return null;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(-minX, -minY);
    bakeCellFills(ctx, debugView, reachableMask);
    if (includeVectors) drawPortalEdges(ctx, debugView, grid, reachableMask);
    return { canvas, minX, minY, maxX, maxY };
}
export class NavPathDebugBaker {
    static bakeTopologyLayer(debugView, grid, mode) {
        if (mode === NAV_PATH_DEBUG_MODE.REACHABLE) return null;
        return bakeLayerCanvas(debugView, grid.minX, grid.minY, grid.maxX, grid.maxY, null, grid, true);
    }
    static bakeReachableLayer(debugView, grid, reachableMask) {
        return bakeLayerCanvas(debugView, grid.minX, grid.minY, grid.maxX, grid.maxY, reachableMask, grid, true);
    }
}
export class NavPathDebugCache {
    constructor() {
        this.topologyKey = "";
        this.topologyBake = null;
        this.debugView = null;
        this.topologyBakePromise = null;
        this.topologyBakeTargetKey = "";
        this.topologyRedrawScheduled = false;
        this.reachableKey = "";
        this.reachableBake = null;
    }
    static topologyKey(state, mode) {
        const grid = state.obstacleGrid;
        return `${gridNavCacheKey(grid)}:${state.nav.graphSyncGeneration}:${floorOccupancyStampDrawCacheKey(grid)}:${grid.cols}x${grid.rows}:${mode}`;
    }
    static reachableKey(topologyKey, seedCellIdx) {
        return `${topologyKey}:${seedCellIdx}`;
    }
    static seedCellIdx(state) {
        const grid = state.obstacleGrid;
        const prop = state.sandbox?.controller?.session?.getSelectedProp();
        if (!prop) return -1;
        const idx = grid.worldToIdx(prop.x, prop.y);
        if (idx < 0) return -1;
        return findNearestOpenCellIdx(grid.grid, grid, idx);
    }
    async ensureTopology(state, mode) {
        const topoKey = NavPathDebugCache.topologyKey(state, mode);
        if (this.topologyKey === topoKey && (this.topologyBake || mode === NAV_PATH_DEBUG_MODE.REACHABLE)) return this.topologyBake;
        if (this.topologyBakePromise && this.topologyBakeTargetKey === topoKey) return this.topologyBakePromise;
        this.topologyBakeTargetKey = topoKey;
        this.topologyBakePromise = (async () => {
            const grid = state.obstacleGrid;
            await state.nav.awaitWorkerNavReady();
            const debugView = state.nav.worker.getRegionGraphDebugView(grid);
            const bake = debugView ? NavPathDebugBaker.bakeTopologyLayer(debugView, grid, mode) : null;
            if (this.topologyBakeTargetKey === topoKey) {
                this.topologyKey = topoKey;
                this.topologyBake = bake;
                this.debugView = debugView;
                this.reachableKey = "";
                this.reachableBake = null;
            }
            this.topologyBakePromise = null;
            return bake;
        })();
        return this.topologyBakePromise;
    }
    updateReachable(state, seedCellIdx) {
        const mode = NAV_PATH_DEBUG_MODE.REACHABLE;
        const topoKey = NavPathDebugCache.topologyKey(state, mode);
        if (!this.debugView || this.topologyKey !== topoKey) return;
        const grid = state.obstacleGrid;
        const topology = state.nav.worker.getNavTopology();
        const octileNeighbors = topology?.octileNeighbors ?? null;
        const blocked = this.debugView.grid;
        const reachableMask = buildNavReachableMaskFromSeed(blocked, octileNeighbors, this.debugView.cols, this.debugView.rows, seedCellIdx, grid.activePortalPairs, grid.activePortalCount);
        this.reachableKey = NavPathDebugCache.reachableKey(topoKey, seedCellIdx);
        this.reachableBake = NavPathDebugBaker.bakeReachableLayer(this.debugView, grid, reachableMask);
    }
    draw(ctx, state, mode, onCacheReady) {
        const topoKey = NavPathDebugCache.topologyKey(state, mode);
        const seedCellIdx = mode === NAV_PATH_DEBUG_MODE.REACHABLE ? NavPathDebugCache.seedCellIdx(state) : -1;
        if (this.topologyKey !== topoKey) {
            if (!this.topologyRedrawScheduled) {
                this.topologyRedrawScheduled = true;
                void this.ensureTopology(state, mode).then(() => {
                    this.topologyRedrawScheduled = false;
                    if (mode === NAV_PATH_DEBUG_MODE.REACHABLE) this.updateReachable(state, seedCellIdx);
                    onCacheReady?.();
                });
            }
        } else if (mode === NAV_PATH_DEBUG_MODE.REACHABLE) {
            const rKey = NavPathDebugCache.reachableKey(topoKey, seedCellIdx);
            if (this.reachableKey !== rKey) this.updateReachable(state, seedCellIdx);
        }
        const layer = mode === NAV_PATH_DEBUG_MODE.REACHABLE ? this.reachableBake : this.topologyBake;
        if (!layer) return;
        ctx.drawImage(layer.canvas, layer.minX, layer.minY);
    }
}
export function getNavPathDebugCache(state) {
    if (!state.navPathDebug) state.navPathDebug = new NavPathDebugCache();
    return state.navPathDebug;
}
