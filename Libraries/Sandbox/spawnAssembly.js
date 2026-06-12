import { getWallHeight } from "../WorldSurface/WorldSurfaceSettings.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { SceneCompiler } from "../Render/Scene/SceneCompiler.js";
import { buildAssemblyLayout, buildAssemblyClearBounds, buildAssemblyWallSegments } from "./assemblyLayout.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { stampAssemblyGroupMember, entityBelongsToAssemblyGroup } from "./assemblies/assemblyLink.js";
import { createAssemblyGuideOverlay, createAssemblySurfaceZone } from "./assemblySurfaceDraw.js";
import { eagerBakeAssemblySurfaceFlipbook, releaseAssemblySurfaceFlipbook } from "./assemblySurfaceBake.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { spawnAssemblyPickups } from "./assemblyPickupSpawn.js";
import { spawnAssemblyPads } from "./assemblyPadSpawn.js";
import { deleteSandboxPad } from "./sandboxPads.js";
import { getWallCellBounds, unionGridCellRect } from "../Spatial/grid/wallGridBake.js";
import { pointInAabb } from "../Math/Aabb2D.js";
/** @param {object} state @param {object} wall */
function detachSandboxWall(state, wall) {
    const idx = state.walls.indexOf(wall);
    if (idx >= 0) state.walls.splice(idx, 1);
    state.wallSpatialIndex.remove(wall);
    const bounds = state.obstacleGrid.patchAfterWallRemoved(wall, state.wallSpatialIndex);
    if (bounds) state.worldSurfaces.invalidateGridBounds(bounds, state);
    state.worldSurfaces.renderScene.removeBySourceId(wall.id);
    return bounds ?? null;
}
/** @param {object} state @param {object[]} walls @param {{ notifyNavigation?: boolean }} [options] */
export function removeSandboxWalls(state, walls, { notifyNavigation = true } = {}) {
    let damageBounds = null;
    for (let i = 0; i < walls.length; i++) damageBounds = unionGridCellRect(damageBounds, detachSandboxWall(state, walls[i]));
    if (damageBounds && notifyNavigation) state.navigation.onObstaclesChanged(damageBounds);
    if (walls.length) state.worldSurfaces.invalidateRoofs();
}
/** @param {object} state @param {object[]} walls @param {{ compileRender?: boolean, notifyNavigation?: boolean }} [options] */
export function addSandboxWalls(state, walls, { compileRender = true, notifyNavigation = true } = {}) {
    const scene = state.worldSurfaces.renderScene;
    const defaultWallHeight = getWallHeight(getGameWorldSurfaceSettings());
    const grid = state.obstacleGrid;
    const gridMinX = grid.minX;
    const gridMinY = grid.minY;
    scene.setGridOrigin(gridMinX, gridMinY);
    let damageBounds = null;
    for (let i = 0; i < walls.length; i++) {
        const wall = walls[i];
        state.walls.push(wall);
        state.wallSpatialIndex.insert(wall);
        grid.addWall(wall);
        damageBounds = unionGridCellRect(
            damageBounds,
            getWallCellBounds(wall, (x, y) => grid.worldToGrid(x, y), grid.cols, grid.rows),
        );
        if (compileRender && !wall.collisionOnly) SceneCompiler.compileWall(wall, scene, defaultWallHeight);
    }
    if (damageBounds) {
        state.worldSurfaces.invalidateGridBounds(damageBounds, state);
        if (notifyNavigation) state.navigation.onObstaclesChanged(damageBounds);
    }
    if (compileRender) state.worldSurfaces.invalidateRoofs();
}
/** @param {object} state @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} bounds */
export function clearSandboxWallsInBounds(state, bounds) {
    const candidates = state.wallSpatialIndex.collectInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    const toRemove = [];
    for (let i = 0; i < candidates.length; i++) {
        const wall = candidates[i];
        if (wall.isDead || !pointInAabb(wall.x, wall.y, bounds)) continue;
        toRemove.push(wall);
    }
    if (toRemove.length) removeSandboxWalls(state, toRemove);
}
/** @param {object} state @param {ReturnType<typeof buildAssemblyLayout>} layout @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved @param {string} groupId @param {string} groupField */
function registerAssemblyPlayfieldSurface(state, layout, resolved, groupId, groupField) {
    const profileId = resolved.surfaceProfileId;
    if (!profileId) return null;
    const zone = createAssemblySurfaceZone({
        id: `${groupId}:surface`,
        profileId,
        surfaceAnimation: resolved.surfaceAnimation === true,
        play: layout.play,
        bounds: layout.bounds,
        railHeight: resolved.arena.walls.height,
    });
    stampAssemblyGroupMember(zone, groupId, resolved.id, groupField);
    state.sandboxSurfaceProfileZones.push(zone);
    const bakeGeneration = ++zone.bakeGeneration;
    void eagerBakeAssemblySurfaceFlipbook(
        { play: layout.play, bounds: layout.bounds, railHeight: resolved.arena.walls.height },
        profileId,
        resolved.surfaceAnimation === true,
        state.worldSurfaces.worldSurfaceSeed,
    ).then((flipbook) => {
        if (zone.bakeGeneration !== bakeGeneration) {
            releaseAssemblySurfaceFlipbook(flipbook);
            return;
        }
        zone.flipbook = flipbook;
        requestUiUpdate();
    });
    return zone;
}
/** @param {object} state @param {ReturnType<typeof buildAssemblyLayout>} layout @param {string} groupId @param {string} assemblyId @param {string} groupField */
function registerAssemblyGuideOverlay(state, layout, groupId, assemblyId, groupField) {
    if (!layout.wallSegments.length && !layout.arcWallSegments.length) return null;
    const guide = createAssemblyGuideOverlay({ id: `${groupId}:guides`, wallSegments: layout.wallSegments, arcWallSegments: layout.arcWallSegments, railWidth: 3.2 });
    stampAssemblyGroupMember(guide, groupId, assemblyId, groupField);
    state.sandboxAssemblyGuides.push(guide);
    return guide;
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {number} centerX
 * @param {number} centerY
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {{ faction?: string }} [options]
 */
export function spawnResolvedAssembly(host, centerX, centerY, resolved, { faction } = {}) {
    const state = host.getWorldState();
    const layout = buildAssemblyLayout(centerX, centerY, resolved);
    clearSandboxWallsInBounds(state, buildAssemblyClearBounds(layout, resolved));
    const groupId = `${resolved.id}:${Date.now()}`;
    const rackId = `${groupId}:rack`;
    const groupField = resolved.groupField;
    const flatSurface = Boolean(resolved.surfaceProfileId);
    registerAssemblyPlayfieldSurface(state, layout, resolved, groupId, groupField);
    if (flatSurface) registerAssemblyGuideOverlay(state, layout, groupId, resolved.id, groupField);
    const arenaWidth = resolved.arena.width;
    const arenaHeight = resolved.arena.height;
    const walls = buildAssemblyWallSegments(layout, resolved, { collisionOnly: flatSurface });
    if (flatSurface) for (let i = 0; i < walls.length; i++) walls[i].collisionOnly = true;
    for (let i = 0; i < walls.length; i++) stampAssemblyGroupMember(walls[i], groupId, resolved.id, groupField);
    addSandboxWalls(state, walls, { compileRender: true });
    let defaultPickupId = null;
    /** @type {Map<string, number>} */
    let pickupIdByManifestId = new Map();
    if (resolved.pickups.length) {
        const spawned = spawnAssemblyPickups(host, layout, resolved, { faction, groupId, rackId, groupField });
        defaultPickupId = spawned.defaultPickupId;
        pickupIdByManifestId = spawned.pickupIdByManifestId;
    }
    if (resolved.pads.length) spawnAssemblyPads(state, layout, { groupId, resolvedId: resolved.id, groupField, pickupIdByManifestId });
    const instance = { id: groupId, assemblyId: resolved.id, defaultPickupId, arenaWidth, arenaHeight };
    state.sandboxAssemblyInstances.push(instance);
    return { id: groupId, assemblyId: resolved.id, defaultPickupId, centerX, centerY };
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {number} centerX
 * @param {number} centerY
 * @param {string} assemblyId
 * @param {{ faction?: string }} [options]
 */
export function spawnAssembly(host, centerX, centerY, assemblyId, options = {}) {
    const resolved = getResolvedAssembly(assemblyId);
    return spawnResolvedAssembly(host, centerX, centerY, resolved, options);
}
/** @param {object} state @param {string} groupId @param {string} groupField */
export function deleteAssemblyInstance(state, groupId, groupField) {
    for (let z = state.sandboxSurfaceProfileZones.length - 1; z >= 0; z--) {
        const zone = state.sandboxSurfaceProfileZones[z];
        if (!entityBelongsToAssemblyGroup(zone, groupId, groupField)) continue;
        zone.bakeGeneration++;
        releaseAssemblySurfaceFlipbook(zone.flipbook);
        zone.flipbook = null;
        state.sandboxSurfaceProfileZones.splice(z, 1);
    }
    for (let z = state.sandboxAssemblyGuides.length - 1; z >= 0; z--) if (entityBelongsToAssemblyGroup(state.sandboxAssemblyGuides[z], groupId, groupField)) state.sandboxAssemblyGuides.splice(z, 1);
    const wallsToRemove = [];
    for (let i = state.walls.length - 1; i >= 0; i--) {
        const wall = state.walls[i];
        if (entityBelongsToAssemblyGroup(wall, groupId, groupField)) wallsToRemove.push(wall);
    }
    removeSandboxWalls(state, wallsToRemove);
    for (let z = state.sandboxPads.length - 1; z >= 0; z--) {
        const pad = state.sandboxPads[z];
        if (entityBelongsToAssemblyGroup(pad, groupId, groupField)) deleteSandboxPad(state, pad.id);
    }
    const rackId = `${groupId}:rack`;
    for (let i = state.pickups.length - 1; i >= 0; i--) {
        const pickup = state.pickups[i];
        if (pickup.assemblyRackId === rackId || entityBelongsToAssemblyGroup(pickup, groupId, groupField)) state.pickups.splice(i, 1);
    }
    const idx = state.sandboxAssemblyInstances.findIndex((entry) => entry.id === groupId);
    if (idx >= 0) state.sandboxAssemblyInstances.splice(idx, 1);
}
/** @param {object} state */
export function clearAssemblyInstances(state) {
    const snapshot = state.sandboxAssemblyInstances.map((entry) => ({ id: entry.id, groupField: getResolvedAssembly(entry.assemblyId).groupField }));
    for (let i = 0; i < snapshot.length; i++) deleteAssemblyInstance(state, snapshot[i].id, snapshot[i].groupField);
}
