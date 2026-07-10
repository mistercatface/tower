import { getInnerRadiusCells, getMapGenBoundsAabbCache, getMapGenBoundsCenterWorldF32, getMapGenBoundsConfig, migrateMapGenBoundsForMode } from "../../../Libraries/Spatial/spatial.js";
import { VIEW_TIER } from "../../../Libraries/Viewport/ViewBounds.js";
import { activeMapGenKind } from "./mapOverview.js";
import { drawWorldBoundsBox, drawWorldCircle, hitTestRectAabb, hitTestRectAabbF32, overviewBoundsCursor, screenToWorld, worldToScreen } from "./mapOverviewDraw.js";
import { ENGINE_F32, M_VEC_A } from "../../../Libraries/Math/math.js";
const EDGE_HIT_PX = 8;
/** @typedef {"move" | "resize-outer" | "resize-inner" | "resize-e" | "resize-w" | "resize-n" | "resize-s" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw"} MapGenBoundsDragMode */
/** @param {CanvasRenderingContext2D} ctx @param {import("../../../Libraries/Spatial/spatial.js").WorldObstacleGrid} grid @param {import("../../../Libraries/Sandbox/mapGenBounds.js").MapGenBoundsConfig} config @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache @param {number} displayW @param {number} displayH @param {string} [color] */
export function drawMapGenBoundsPreview(ctx, grid, config, cache, displayW, displayH, color = "#ff9800") {
    const cellSize = grid.cellSize;
    getMapGenBoundsCenterWorldF32(ENGINE_F32, M_VEC_A, grid, config);
    const cx = ENGINE_F32[M_VEC_A];
    const cy = ENGINE_F32[M_VEC_A + 1];
    const outerR = config.outerRadiusCells * cellSize;
    drawWorldCircle(ctx, cx, cy, outerR, cache, displayW, displayH, color, 2);
    if (config.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(config) * cellSize;
        drawWorldCircle(ctx, cx, cy, innerR, cache, displayW, displayH, color, 2, [4, 4]);
    }
}
/**
 * @param {number} sx
 * @param {number} sy
 * @param {import("../../../Libraries/Sandbox/mapGenBounds.js").MapGenBoundsConfig} config
 * @param {import("../../../Libraries/Sandbox/mapGenBounds.js").MapGenBoundsAabbCache} boundsCache
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 * @returns {MapGenBoundsDragMode | null}
 */
export function hitTestMapGenBounds(sx, sy, grid, config, boundsCache, cache, displayW, displayH) {
    const cellSize = grid.cellSize;
    if (config.boundsMode === "rect") return hitTestRectAabb(sx, sy, boundsCache.aabb, cache, displayW, displayH);
    getMapGenBoundsCenterWorldF32(ENGINE_F32, M_VEC_A, grid, config);
    const centerS = worldToScreen(ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1], cache, displayW, displayH);
    const distPx = Math.hypot(sx - centerS.x, sy - centerS.y);
    const mapW = cache.maxX - cache.minX;
    const outerPx = ((config.outerRadiusCells * cellSize) / mapW) * displayW;
    const innerPx = ((getInnerRadiusCells(config) * cellSize) / mapW) * displayW;
    if (Math.abs(distPx - outerPx) <= EDGE_HIT_PX) return "resize-outer";
    if (config.boundsMode === "donut" && Math.abs(distPx - innerPx) <= EDGE_HIT_PX) return "resize-inner";
    if (distPx < outerPx - EDGE_HIT_PX && (config.boundsMode !== "donut" || distPx > innerPx + EDGE_HIT_PX)) return "move";
    return null;
}
/** @param {MapGenBoundsDragMode} mode @param {number} dxWorld @param {number} dyWorld @param {import("../../../Libraries/Sandbox/mapGenBounds.js").MapGenBoundsConfig} config */
export function applyMapGenBoundsDrag(grid, mode, dxWorld, dyWorld, config) {
    const cellSize = grid.cellSize;
    const dxCells = dxWorld / cellSize;
    const dyCells = dyWorld / cellSize;
    const cols = grid.cols;
    if (config.boundsMode === "rect") {
        if (mode === "move") config.boundsIdx += Math.round(dxCells) + Math.round(dyCells) * cols;
        else if (mode === "resize-e") config.boundsCols = Math.max(1, Math.round(config.boundsCols + dxCells));
        else if (mode === "resize-w") {
            const next = Math.max(1, Math.round(config.boundsCols - dxCells));
            config.boundsIdx += Math.round(config.boundsCols - next);
            config.boundsCols = next;
        } else if (mode === "resize-s") config.boundsRows = Math.max(1, Math.round(config.boundsRows + dyCells));
        else if (mode === "resize-n") {
            const next = Math.max(1, Math.round(config.boundsRows - dyCells));
            config.boundsIdx += Math.round(config.boundsRows - next) * cols;
            config.boundsRows = next;
        } else if (mode === "resize-se") {
            config.boundsCols = Math.max(1, Math.round(config.boundsCols + dxCells));
            config.boundsRows = Math.max(1, Math.round(config.boundsRows + dyCells));
        } else if (mode === "resize-sw") {
            const nextCols = Math.max(1, Math.round(config.boundsCols - dxCells));
            config.boundsIdx += Math.round(config.boundsCols - nextCols);
            config.boundsCols = nextCols;
            config.boundsRows = Math.max(1, Math.round(config.boundsRows + dyCells));
        } else if (mode === "resize-ne") {
            config.boundsCols = Math.max(1, Math.round(config.boundsCols + dxCells));
            const nextRows = Math.max(1, Math.round(config.boundsRows - dyCells));
            config.boundsIdx += Math.round(config.boundsRows - nextRows) * cols;
            config.boundsRows = nextRows;
        } else if (mode === "resize-nw") {
            const nextCols = Math.max(1, Math.round(config.boundsCols - dxCells));
            config.boundsIdx += Math.round(config.boundsCols - nextCols);
            config.boundsCols = nextCols;
            const nextRows = Math.max(1, Math.round(config.boundsRows - dyCells));
            config.boundsIdx += Math.round(config.boundsRows - nextRows) * cols;
            config.boundsRows = nextRows;
        }
        migrateMapGenBoundsForMode(grid, config);
        return;
    }
    if (mode === "move") {
        let centerCol = config.centerIdx % cols;
        let centerRow = (config.centerIdx / cols) | 0;
        centerCol += Math.round(dxCells);
        centerRow += Math.round(dyCells);
        config.centerIdx = grid.worldToIdx(grid.gridCenterX(centerCol), grid.gridCenterY(centerRow));
    } else if (mode === "resize-outer") {
        const delta = Math.round((dxCells + dyCells) * 0.5);
        config.outerRadiusCells = Math.max(1, config.outerRadiusCells + delta);
        if (config.boundsMode === "donut") config.donutThicknessCells = Math.min(config.donutThicknessCells, config.outerRadiusCells - 1);
    } else if (mode === "resize-inner") {
        const delta = Math.round((dxCells + dyCells) * 0.5);
        config.donutThicknessCells = Math.max(1, Math.min(config.outerRadiusCells - 1, config.donutThicknessCells - delta));
    }
    migrateMapGenBoundsForMode(grid, config);
}
/** @param {MapGenBoundsDragMode} mode @param {number} worldX @param {number} worldY @param {import("../../../Libraries/Sandbox/mapGenBounds.js").MapGenBoundsConfig} config */
export function applyMapGenBoundsDragAtPointer(grid, mode, worldX, worldY, config) {
    const cellSize = grid.cellSize;
    if (config.boundsMode === "rect") return;
    getMapGenBoundsCenterWorldF32(ENGINE_F32, M_VEC_A, grid, config);
    const distCells = Math.hypot(worldX - ENGINE_F32[M_VEC_A], worldY - ENGINE_F32[M_VEC_A + 1]) / cellSize;
    if (mode === "resize-outer") {
        config.outerRadiusCells = Math.max(1, Math.round(distCells));
        if (config.boundsMode === "donut") config.donutThicknessCells = Math.min(config.donutThicknessCells, config.outerRadiusCells - 1);
    } else if (mode === "resize-inner") config.donutThicknessCells = Math.max(1, Math.min(config.outerRadiusCells - 1, Math.round(config.outerRadiusCells - distCells)));
    migrateMapGenBoundsForMode(grid, config);
}
/**
 * @typedef {object} OverviewBoundsEditor
 * @property {() => boolean} isEnabled
 * @property {(sx: number, sy: number, frame: { cache: import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache, displayW: number, displayH: number }) => MapGenBoundsDragMode | null} hitTest
 * @property {(mode: MapGenBoundsDragMode, dxWorld: number, dyWorld: number, worldX: number, worldY: number) => void} applyDrag
 */
/** @param {import("../state.js").TileLabGameState} state @returns {OverviewBoundsEditor} */
export function createMapGenBoundsOverviewEditor(state) {
    return {
        isEnabled: () => activeMapGenKind(state) !== null,
        hitTest: (sx, sy, frame) => {
            const genKind = activeMapGenKind(state);
            if (!genKind) return null;
            const config = getMapGenBoundsConfig(state.editor, genKind);
            const boundsCache = getMapGenBoundsAabbCache(state.editor, genKind);
            return hitTestMapGenBounds(sx, sy, state.obstacleGrid, config, boundsCache, frame.cache, frame.displayW, frame.displayH);
        },
        applyDrag: (mode, dxWorld, dyWorld, worldX, worldY) => {
            const genKind = activeMapGenKind(state);
            if (!genKind) return;
            const config = getMapGenBoundsConfig(state.editor, genKind);
            if (mode === "resize-outer" || mode === "resize-inner") applyMapGenBoundsDragAtPointer(state.obstacleGrid, mode, worldX, worldY, config);
            else applyMapGenBoundsDrag(state.obstacleGrid, mode, dxWorld, dyWorld, config);
        },
    };
}
/** @param {import("../state.js").TileLabGameState} state @returns {OverviewBoundsEditor} */
export function createViewportOverviewEditor(state) {
    return {
        isEnabled: () => state.editor.showMapOverview,
        hitTest: (sx, sy, frame) => {
            return hitTestRectAabbF32(sx, sy, state.viewport.boundsBuf, VIEW_TIER.CLIP, frame.cache, frame.displayW, frame.displayH, { moveOnly: true });
        },
        applyDrag: (mode, dxWorld, dyWorld) => {
            if (mode === "move") state.viewport.snapTo(state.viewport.x + dxWorld, state.viewport.y + dyWorld);
        },
    };
}
/** @param {HTMLCanvasElement} canvas @param {OverviewBoundsEditor[]} editors @param {() => { cache: import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache, displayW: number, displayH: number }} getFrame @param {() => void} onChange */
export function mountOverviewBoundsEditors(canvas, editors, getFrame, onChange) {
    /** @type {OverviewBoundsEditor | null} */
    let dragEditor = null;
    /** @type {MapGenBoundsDragMode | null} */
    let dragMode = null;
    let lastWorldX = 0;
    let lastWorldY = 0;
    const pointerToScreen = (e, frame) => {
        const rect = canvas.getBoundingClientRect();
        return { sx: ((e.clientX - rect.left) / rect.width) * frame.displayW, sy: ((e.clientY - rect.top) / rect.height) * frame.displayH };
    };
    const resolveHit = (sx, sy, frame) => {
        for (const editor of editors) {
            if (!editor.isEnabled()) continue;
            const hit = editor.hitTest(sx, sy, frame);
            if (hit) return { editor, hit };
        }
        return null;
    };
    const frameReady = (frame) => frame.cache?.canvas;
    canvas.addEventListener("pointermove", (e) => {
        const frame = getFrame();
        if (!frameReady(frame)) {
            canvas.style.cursor = "default";
            return;
        }
        const { sx, sy } = pointerToScreen(e, frame);
        if (!dragMode) {
            const resolved = resolveHit(sx, sy, frame);
            canvas.style.cursor = overviewBoundsCursor(resolved?.hit ?? null);
            return;
        }
        const world = screenToWorld(sx, sy, frame.cache, frame.displayW, frame.displayH);
        dragEditor.applyDrag(dragMode, world.x - lastWorldX, world.y - lastWorldY, world.x, world.y);
        lastWorldX = world.x;
        lastWorldY = world.y;
        onChange();
    });
    canvas.addEventListener("pointerdown", (e) => {
        const frame = getFrame();
        if (!frameReady(frame)) return;
        const { sx, sy } = pointerToScreen(e, frame);
        const resolved = resolveHit(sx, sy, frame);
        if (!resolved) return;
        e.preventDefault();
        e.stopPropagation();
        dragEditor = resolved.editor;
        dragMode = resolved.hit;
        const world = screenToWorld(sx, sy, frame.cache, frame.displayW, frame.displayH);
        lastWorldX = world.x;
        lastWorldY = world.y;
        canvas.setPointerCapture(e.pointerId);
    });
    const finishDrag = (e) => {
        if (!dragMode) return;
        canvas.releasePointerCapture(e.pointerId);
        dragEditor = null;
        dragMode = null;
    };
    canvas.addEventListener("pointerup", finishDrag);
    canvas.addEventListener("pointercancel", finishDrag);
}
