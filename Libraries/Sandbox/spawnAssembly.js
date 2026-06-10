import { getWallHeight } from "../WorldSurface/WorldSurfaceSettings.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { SceneCompiler } from "../Render/Scene/SceneCompiler.js";
import { createVoidZone } from "../Spatial/zones/voidZone.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { buildSandboxPoolTableLayout, buildPoolTableClearBounds, buildPoolTableWallSegments } from "./poolTableLayout.js";
import { spawnAssemblyRack } from "./spawnAssemblyRack.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { stampAssemblyGroupMember, entityBelongsToAssemblyGroup } from "./assemblies/assemblyLink.js";
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
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {number} centerX
 * @param {number} centerY
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {{ faction?: string, groupId?: string }} [options]
 */
export function spawnPoolTableAssembly(host, centerX, centerY, resolved, { faction, groupId: groupIdOverride } = {}) {
    const state = host.getWorldState?.();
    if (!state || resolved.id !== "poolTable") return null;
    if (!getPropAsset(resolved.props.cueBall) || !getPropAsset(resolved.props.objectBall)) return null;
    const tableLayout = resolved.layout;
    const ballRadius = tableLayout.ballRadius;
    const layout = buildSandboxPoolTableLayout(centerX, centerY, tableLayout);
    clearWallsInBounds(state, buildPoolTableClearBounds(layout));
    const groupId = groupIdOverride ?? `${resolved.id}:${Date.now()}`;
    const rackId = `${groupId}:rack`;
    const groupField = resolved.groupField;
    const tableWidth = tableLayout.cols * tableLayout.cellSize;
    const tableHeight = tableLayout.rows * tableLayout.cellSize;
    const spawnSteps = new Set(resolved.spawn);
    if (spawnSteps.has("walls")) {
        const railHeight = layout.cellSize;
        const walls = buildPoolTableWallSegments(layout, ballRadius, railHeight, tableLayout);
        for (let i = 0; i < walls.length; i++) stampAssemblyGroupMember(walls[i], groupId, resolved.id, groupField);
        addSandboxWalls(state, walls);
    }
    if (spawnSteps.has("voidPockets")) {
        if (!state.sandboxVoidZones) state.sandboxVoidZones = [];
        for (let p = 0; p < layout.pockets.length; p++) {
            const pocket = layout.pockets[p];
            const zone = createVoidZone(pocket.x, pocket.y, pocket.radius, { id: `${groupId}:pocket:${p + 1}`, depth: layout.pocketDepth });
            stampAssemblyGroupMember(zone, groupId, resolved.id, groupField);
            state.sandboxVoidZones.push(zone);
        }
    }
    let rack = null;
    if (spawnSteps.has("rack")) {
        rack = spawnAssemblyRack(host, layout.balls.cue.x, layout.balls.cue.y, { faction, rackId, groupId, resolved, layout: layout.balls });
        if (!rack) return null;
    }
    if (!state.sandboxAssemblyInstances) state.sandboxAssemblyInstances = [];
    const instance = { id: groupId, assemblyId: resolved.id, rackId, cueBallId: rack?.cueBallId ?? null, tableWidth, tableHeight, groupField };
    state.sandboxAssemblyInstances.push(instance);
    if (!state.sandboxPoolTables) state.sandboxPoolTables = [];
    state.sandboxPoolTables.push({ id: groupId, assemblyId: resolved.id, rackId, cueBallId: rack?.cueBallId ?? null });
    return { id: groupId, assemblyId: resolved.id, cueBallId: rack?.cueBallId ?? null, centerX, centerY };
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {number} centerX
 * @param {number} centerY
 * @param {string} [assemblyId]
 * @param {{ faction?: string }} [options]
 */
export function spawnAssembly(host, centerX, centerY, assemblyId = "poolTable", options = {}) {
    const resolved = getResolvedAssembly(assemblyId);
    if (!resolved) return null;
    if (resolved.id === "poolTable") return spawnPoolTableAssembly(host, centerX, centerY, resolved, options);
    return null;
}
/** @param {object} state @param {string} groupId @param {string} [groupField] */
export function deleteAssemblyInstance(state, groupId, groupField = "sandboxGroupId") {
    if (!state) return;
    for (let i = state.walls.length - 1; i >= 0; i--) if (entityBelongsToAssemblyGroup(state.walls[i], groupId, groupField)) removeSandboxWall(state, state.walls[i]);
    if (state.sandboxVoidZones)
        for (let z = state.sandboxVoidZones.length - 1; z >= 0; z--) if (entityBelongsToAssemblyGroup(state.sandboxVoidZones[z], groupId, groupField)) state.sandboxVoidZones.splice(z, 1);
    const rackId = `${groupId}:rack`;
    for (let i = state.pickups.length - 1; i >= 0; i--) {
        const pickup = state.pickups[i];
        if (pickup.sandboxPoolRackId === rackId || entityBelongsToAssemblyGroup(pickup, groupId, groupField)) state.pickups.splice(i, 1);
    }
    if (state.sandboxAssemblyInstances) {
        const idx = state.sandboxAssemblyInstances.findIndex((entry) => entry.id === groupId);
        if (idx >= 0) state.sandboxAssemblyInstances.splice(idx, 1);
    }
    if (state.sandboxPoolTables) {
        const idx = state.sandboxPoolTables.findIndex((entry) => entry.id === groupId);
        if (idx >= 0) state.sandboxPoolTables.splice(idx, 1);
    }
}
/** @param {object} state */
export function clearAssemblyInstances(state) {
    if (!state?.sandboxAssemblyInstances?.length && !state?.sandboxPoolTables?.length) return;
    const ids = (state.sandboxAssemblyInstances ?? state.sandboxPoolTables).map((entry) => entry.id);
    for (let i = 0; i < ids.length; i++) deleteAssemblyInstance(state, ids[i]);
}
