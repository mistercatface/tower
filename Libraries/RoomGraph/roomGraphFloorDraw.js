import { composeDestinationIn } from "../Canvas/maskCompositor.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
import { bakePixelsForWorldSpan, drawBakedTexture } from "../WorldSurface/WorldSurfaceResolution.js";
import { getSurfaceProfileRevision } from "../WorldSurface/SurfaceProfileRevision.js";
import { TileWorkerCoordinator } from "../WorldSurface/TileWorkerCoordinator.js";
import { indexToColRow } from "../Spatial/grid/GridUtils.js";
import { getRoomGraph, getRoomLink, listRoomNodes } from "./roomGraphStore.js";
import { roomNodeWorldAabb } from "./roomGraphSurfaceProfile.js";
/** @param {import("../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine} engine @param {string} key @param {object} payload */
function scheduleHorizontalPatch(engine, key, payload) {
    const placeholder = engine.surfaceCache.getOrStart(key);
    const generation = engine.surfaceCache.getCurrentGeneration(key);
    TileWorkerCoordinator.requestHorizontalPatchBake(payload).then((bitmaps) => {
        engine.surfaceCache.commitBake(key, generation, bitmaps);
    });
    return placeholder;
}
/** @param {number} linkId @param {number[]} cellIndices */
function corridorMaskCacheKey(linkId, cellIndices) {
    return `corridorFloorMask:${linkId}:${cellIndices.join(";")}`;
}
/** @param {number} linkId @param {string} profileId @param {number} rev */
function corridorDrawCacheKey(linkId, profileId, rev) {
    return `corridorFloorDraw:${linkId}:${rev}:${profileId}`;
}
/** @param {number[]} cellIndices @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} originX @param {number} originY @param {number} worldW @param {number} worldH @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings */
function buildCorridorFloorMaskCanvas(cellIndices, grid, originX, originY, worldW, worldH, settings) {
    const surfaceBakeScale = settings.surfaceBakeScale;
    const bakeW = bakePixelsForWorldSpan(worldW, surfaceBakeScale);
    const bakeH = bakePixelsForWorldSpan(worldH, surfaceBakeScale);
    const cellBakeSize = bakePixelsForWorldSpan(grid.cellSize, surfaceBakeScale);
    const canvas = createOffscreenCanvas(bakeW, bakeH);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    for (let i = 0; i < cellIndices.length; i++) {
        const { col, row } = indexToColRow(cellIndices[i], grid.cols);
        const bounds = grid.getCellBounds(col, row);
        const x = Math.round((bounds.minX - originX) * surfaceBakeScale);
        const y = Math.round((bounds.minY - originY) * surfaceBakeScale);
        ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
        any = true;
    }
    return any ? canvas : null;
}
/** @param {import("../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine} engine @param {object} state @param {import("./roomGraphStore.js").RoomNode} node */
function getRoomFloorCanvas(engine, state, node) {
    const profileId = node.surfaceProfileId;
    if (!profileId) return null;
    const rev = getSurfaceProfileRevision(profileId);
    const key = `roomFloor:${node.id}:${rev}:${profileId}`;
    const cached = engine.surfaceCache.get(key);
    if (cached?.[0] && !cached[0].isPlaceholder) return cached[0];
    if (cached) return null;
    const grid = state.obstacleGrid;
    const aabb = roomNodeWorldAabb(grid, node);
    const worldW = aabb.maxX - aabb.minX;
    const worldH = aabb.maxY - aabb.minY;
    scheduleHorizontalPatch(engine, key, {
        originX: aabb.minX,
        originY: aabb.minY,
        worldWidth: worldW,
        worldHeight: worldH,
        profileId,
        seed: state.worldSurfaces.worldSurfaceSeed ?? 0,
        zLevel: 0,
        centerX: (aabb.minX + aabb.maxX) / 2,
        centerY: (aabb.minY + aabb.maxY) / 2,
    });
    return null;
}
/** @param {import("../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine} engine @param {object} state @param {number} linkId @param {number[]} cellIndices @param {string} profileId */
function getCorridorFloorCanvas(engine, state, linkId, cellIndices, profileId) {
    if (!cellIndices.length) return null;
    const rev = getSurfaceProfileRevision(profileId);
    const grid = state.obstacleGrid;
    const settings = engine.settings;
    let minCol = Infinity;
    let minRow = Infinity;
    let maxCol = -Infinity;
    let maxRow = -Infinity;
    for (let i = 0; i < cellIndices.length; i++) {
        const { col, row } = indexToColRow(cellIndices[i], grid.cols);
        if (col < minCol) minCol = col;
        if (row < minRow) minRow = row;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
    }
    const half = grid.cellHalfSize;
    const w0 = grid.gridToWorld(minCol, minRow);
    const w1 = grid.gridToWorld(maxCol, maxRow);
    const minX = w0.x - half;
    const minY = w0.y - half;
    const maxX = w1.x + half;
    const maxY = w1.y + half;
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const maskKey = corridorMaskCacheKey(linkId, cellIndices);
    const drawKey = corridorDrawCacheKey(linkId, profileId, rev);
    let maskEntry = engine.surfaceCache.get(maskKey);
    if (!maskEntry) {
        const maskCanvas = buildCorridorFloorMaskCanvas(cellIndices, grid, minX, minY, worldW, worldH, settings);
        if (!maskCanvas) {
            engine.surfaceCache.delete(drawKey);
            return null;
        }
        maskEntry = [maskCanvas];
        engine.surfaceCache.set(maskKey, maskEntry);
        engine.surfaceCache.delete(drawKey);
    }
    let drawEntry = engine.surfaceCache.get(drawKey);
    if (drawEntry?.[0] && !drawEntry[0].isPlaceholder) return { canvas: drawEntry[0], minX, minY, worldW, worldH };
    if (drawEntry) return null;
    const patchKey = `${drawKey}:patch`;
    let patchEntry = engine.surfaceCache.get(patchKey);
    if (!patchEntry) {
        scheduleHorizontalPatch(engine, patchKey, {
            originX: minX,
            originY: minY,
            worldWidth: worldW,
            worldHeight: worldH,
            profileId,
            seed: state.worldSurfaces.worldSurfaceSeed ?? 0,
            zLevel: 0,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        });
        return null;
    }
    const patchCanvas = patchEntry[0];
    if (!patchCanvas || patchCanvas.isPlaceholder) return null;
    const masked = composeDestinationIn(patchCanvas, maskEntry[0]);
    engine.surfaceCache.set(drawKey, [masked]);
    engine.surfaceCache.delete(patchKey);
    return { canvas: masked, minX, minY, worldW, worldH };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine} engine
 * @param {object} state
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 */
export function drawRoomGraphFloorPatches(ctx, engine, state, viewport) {
    const nodes = listRoomNodes(state);
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node.surfaceProfileId) continue;
        const aabb = roomNodeWorldAabb(state.obstacleGrid, node);
        if (!viewport.aabbInBounds(aabb, "props")) continue;
        const canvas = getRoomFloorCanvas(engine, state, node);
        if (!canvas) continue;
        drawBakedTexture(ctx, canvas, aabb.minX, aabb.minY, aabb.maxX - aabb.minX, aabb.maxY - aabb.minY);
    }
    const corridors = getRoomGraph(state).bakedCorridorFloorCells;
    if (!corridors?.length) return;
    for (let i = 0; i < corridors.length; i++) {
        const entry = corridors[i];
        const link = getRoomLink(state, entry.linkId);
        if (!link?.surfaceProfileId || !entry.cellIndices.length) continue;
        const draw = getCorridorFloorCanvas(engine, state, entry.linkId, entry.cellIndices, link.surfaceProfileId);
        if (!draw) continue;
        const patchAabb = { minX: draw.minX, minY: draw.minY, maxX: draw.minX + draw.worldW, maxY: draw.minY + draw.worldH };
        if (!viewport.aabbInBounds(patchAabb, "props")) continue;
        drawBakedTexture(ctx, draw.canvas, draw.minX, draw.minY, draw.worldW, draw.worldH);
    }
}
