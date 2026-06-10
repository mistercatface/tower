import { getWallHeight } from "../WorldSurface/WorldSurfaceSettings.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { SceneCompiler } from "../Render/Scene/SceneCompiler.js";
import { createVoidZone } from "../Spatial/zones/voidZone.js";
import { POOL_BALL_RADIUS } from "./poolConfig.js";
import { buildSandboxPoolTableLayout, buildPoolTableClearBounds, buildPoolTableWallSegments } from "./poolTableLayout.js";
import { spawnPoolRack } from "./spawnPoolRack.js";
/** @param {object} state @param {object} wall */
function removeSandboxWall(state, wall) {
    const idx = state.walls.indexOf(wall);
    if (idx >= 0) state.walls.splice(idx, 1);
    state.wallSpatialIndex?.remove(wall);
    const bounds = state.obstacleGrid?.patchAfterWallRemoved(wall, state.wallSpatialIndex);
    if (bounds) {
        state.worldSurfaces?.invalidateGridBounds(bounds, state);
        state.navigation?.onObstaclesChanged(bounds);
    }
    state.worldSurfaces?.renderScene?.removeBySourceId(wall.id ?? wall);
    state.worldSurfaces?.invalidateRoofs();
}
/** @param {object} state @param {object[]} walls */
function addSandboxWalls(state, walls) {
    const scene = state.worldSurfaces?.renderScene;
    const defaultWallHeight = getWallHeight(getGameWorldSurfaceSettings());
    const gridMinX = state.obstacleGrid.minX;
    const gridMinY = state.obstacleGrid.minY;
    if (scene) scene.setGridOrigin(gridMinX, gridMinY);
    for (let i = 0; i < walls.length; i++) {
        const wall = walls[i];
        state.walls.push(wall);
        state.wallSpatialIndex?.insert(wall);
        state.obstacleGrid?.addWall(wall);
        if (scene) SceneCompiler.compileWall(wall, scene, defaultWallHeight);
    }
    state.worldSurfaces?.invalidateRoofs();
}
/** @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds */
function wallCenterInsideBounds(wall, bounds) {
    return wall.x >= bounds.minX && wall.x <= bounds.maxX && wall.y >= bounds.minY && wall.y <= bounds.maxY;
}
/** @param {object} state @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds */
function clearWallsInBounds(state, bounds) {
    const candidates = state.wallSpatialIndex ? state.wallSpatialIndex.collectInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY) : state.walls;
    const toRemove = [];
    for (let i = 0; i < candidates.length; i++) {
        const wall = candidates[i];
        if (wall.isDead || !wallCenterInsideBounds(wall, bounds)) continue;
        toRemove.push(wall);
    }
    for (let i = 0; i < toRemove.length; i++) removeSandboxWall(state, toRemove[i]);
}
/** @param {import("./SandboxHostPort.js").SandboxHostPort} host @param {number} centerX @param {number} centerY @param {{ faction?: string }} [options] */
export function spawnPoolTable(host, centerX, centerY, { faction } = {}) {
    const state = host.getWorldState?.();
    if (!state) return null;
    const ballRadius = POOL_BALL_RADIUS;
    const layout = buildSandboxPoolTableLayout(centerX, centerY, ballRadius);
    clearWallsInBounds(state, buildPoolTableClearBounds(layout));
    const tableId = `pool-table:${Date.now()}`;
    const rackId = `${tableId}:rack`;
    const railHeight = layout.cellSize;
    const walls = buildPoolTableWallSegments(layout, ballRadius, railHeight);
    for (let i = 0; i < walls.length; i++) walls[i].sandboxPoolTableId = tableId;
    addSandboxWalls(state, walls);
    if (!state.sandboxVoidZones) state.sandboxVoidZones = [];
    for (let p = 0; p < layout.pockets.length; p++) {
        const pocket = layout.pockets[p];
        const zone = createVoidZone(pocket.x, pocket.y, pocket.radius, { id: `${tableId}:pocket:${p + 1}`, depth: layout.pocketDepth });
        zone.sandboxPoolTableId = tableId;
        state.sandboxVoidZones.push(zone);
    }
    const rack = spawnPoolRack(host, layout.balls.cue.x, layout.balls.cue.y, { faction, rackId, tableId, layout: layout.balls });
    if (!rack) return null;
    if (!state.sandboxPoolTables) state.sandboxPoolTables = [];
    state.sandboxPoolTables.push({ id: tableId, rackId, cueBallId: rack.cueBallId });
    return { id: tableId, cueBallId: rack.cueBallId, centerX, centerY };
}
/** @param {object} state @param {string} tableId */
export function deletePoolTable(state, tableId) {
    if (!state) return;
    for (let i = state.walls.length - 1; i >= 0; i--) if (state.walls[i].sandboxPoolTableId === tableId) removeSandboxWall(state, state.walls[i]);
    if (state.sandboxVoidZones) for (let z = state.sandboxVoidZones.length - 1; z >= 0; z--) if (state.sandboxVoidZones[z].sandboxPoolTableId === tableId) state.sandboxVoidZones.splice(z, 1);
    const rackId = `${tableId}:rack`;
    for (let i = state.pickups.length - 1; i >= 0; i--) {
        const pickup = state.pickups[i];
        if (pickup.sandboxPoolRackId === rackId || pickup.sandboxPoolTableId === tableId) state.pickups.splice(i, 1);
    }
    if (state.sandboxPoolTables) {
        const idx = state.sandboxPoolTables.findIndex((entry) => entry.id === tableId);
        if (idx >= 0) state.sandboxPoolTables.splice(idx, 1);
    }
}
/** @param {object} state */
export function clearPoolTables(state) {
    if (!state?.sandboxPoolTables?.length) return;
    const ids = state.sandboxPoolTables.map((entry) => entry.id);
    for (let i = 0; i < ids.length; i++) deletePoolTable(state, ids[i]);
}
