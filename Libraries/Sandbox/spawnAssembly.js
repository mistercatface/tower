import { buildAssemblyLayout, buildAssemblyClearBounds, buildAssemblyWallSegments } from "./assemblyLayout.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { stampAssemblySceneMember, entityBelongsToAssemblyGroup } from "./assemblies/assemblyLink.js";
import { createAssemblyGuideOverlay, createAssemblySurfaceZone } from "./assemblySurfaceDraw.js";
import { eagerBakeAssemblySurfaceFlipbook, releaseAssemblySurfaceFlipbook } from "./assemblySurfaceBake.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { spawnAssemblyWorldProps } from "./assemblyWorldPropSpawn.js";
import { spawnAssemblyPads } from "./assemblyPadSpawn.js";
import { deleteSandboxPad } from "./sandboxPads.js";
import { getWallCellBounds, unionGridCellRect } from "../Spatial/grid/wallGridBake.js";
import { pointInAabb } from "../Math/Aabb2D.js";
import { removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @param {object} state @param {object} wall */
function detachSandboxWall(state, wall) {
    const idx = state.walls.indexOf(wall);
    if (idx >= 0) state.walls.splice(idx, 1);
    state.wallSpatialIndex.remove(wall);
    const bounds = state.obstacleGrid.patchAfterWallRemoved(wall, state.wallSpatialIndex);
    if (bounds) state.worldSurfaces.invalidateGridBounds(bounds, state);
    return bounds ?? null;
}
/** @param {object} state @param {object[]} walls @param {{ notifyNavigation?: boolean }} [options] */
export function removeSandboxWalls(state, walls, { notifyNavigation = true } = {}) {
    let damageBounds = null;
    for (let i = 0; i < walls.length; i++) damageBounds = unionGridCellRect(damageBounds, detachSandboxWall(state, walls[i]));
    if (damageBounds && notifyNavigation) state.navigation.onObstaclesChanged(damageBounds);
}
/** @param {object} state @param {object[]} walls @param {{ notifyNavigation?: boolean }} [options] */
export function addSandboxWalls(state, walls, { notifyNavigation = true } = {}) {
    const grid = state.obstacleGrid;
    let damageBounds = null;
    for (let i = 0; i < walls.length; i++) {
        const wall = walls[i];
        wall.collisionOnly = true;
        state.walls.push(wall);
        state.wallSpatialIndex.insert(wall);
        grid.addWall(wall);
        damageBounds = unionGridCellRect(
            damageBounds,
            getWallCellBounds(wall, (x, y) => grid.worldToGrid(x, y), grid.cols, grid.rows),
        );
    }
    if (damageBounds) {
        state.worldSurfaces.invalidateGridBounds(damageBounds, state);
        if (notifyNavigation) state.navigation.onObstaclesChanged(damageBounds);
    }
}
/** @param {object} state @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} bounds */
export function clearSandboxWallsInBounds(state, bounds) {
    const candidates = state.wallSpatialIndex.collectInBounds(bounds);
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
    stampAssemblySceneMember(zone, groupId, resolved.id, groupField);
    state.sandbox.surfaceProfileZones.push(zone);
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
    stampAssemblySceneMember(guide, groupId, assemblyId, groupField);
    state.sandbox.assemblyGuides.push(guide);
    return guide;
}
/**
 * @param {object} state
 * @param {number} centerX
 * @param {number} centerY
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {{ faction?: string }} [options]
 */
export function spawnResolvedAssembly(state, centerX, centerY, resolved, { faction } = {}) {
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
    const walls = buildAssemblyWallSegments(layout, resolved, { collisionOnly: true });
    for (let i = 0; i < walls.length; i++) stampAssemblySceneMember(walls[i], groupId, resolved.id, groupField);
    addSandboxWalls(state, walls);
    let defaultPropId = null;
    /** @type {Map<string, number>} */
    let propIdByManifestId = new Map();
    if (resolved.worldProps.length) {
        const spawned = spawnAssemblyWorldProps(state, layout, resolved, { faction, groupId, rackId, groupField });
        defaultPropId = spawned.defaultPropId;
        propIdByManifestId = spawned.propIdByManifestId;
    }
    if (resolved.pads.length) spawnAssemblyPads(state, layout, { groupId, resolvedId: resolved.id, groupField, propIdByManifestId });
    const instance = { id: groupId, assemblyId: resolved.id, defaultPropId, arenaWidth, arenaHeight };
    state.sandbox.assemblyInstances.push(instance);
    return { id: groupId, assemblyId: resolved.id, defaultPropId, centerX, centerY };
}
/**
 * @param {object} state
 * @param {number} centerX
 * @param {number} centerY
 * @param {string} assemblyId
 * @param {{ faction?: string }} [options]
 */
export function spawnAssembly(state, centerX, centerY, assemblyId, options = {}) {
    const resolved = getResolvedAssembly(assemblyId);
    return spawnResolvedAssembly(state, centerX, centerY, resolved, options);
}
/** @param {object} state @param {string} groupId @param {string} groupField */
export function deleteAssemblyInstance(state, groupId, groupField) {
    for (let z = state.sandbox.surfaceProfileZones.length - 1; z >= 0; z--) {
        const zone = state.sandbox.surfaceProfileZones[z];
        if (!entityBelongsToAssemblyGroup(state, zone, groupId, groupField)) continue;
        zone.bakeGeneration++;
        releaseAssemblySurfaceFlipbook(zone.flipbook);
        zone.flipbook = null;
        state.sandbox.surfaceProfileZones.splice(z, 1);
    }
    for (let z = state.sandbox.assemblyGuides.length - 1; z >= 0; z--)
        if (entityBelongsToAssemblyGroup(state, state.sandbox.assemblyGuides[z], groupId, groupField)) state.sandbox.assemblyGuides.splice(z, 1);
    const wallsToRemove = [];
    for (let i = state.walls.length - 1; i >= 0; i--) {
        const wall = state.walls[i];
        if (entityBelongsToAssemblyGroup(state, wall, groupId, groupField)) wallsToRemove.push(wall);
    }
    removeSandboxWalls(state, wallsToRemove);
    for (let z = state.sandbox.pads.length - 1; z >= 0; z--) {
        const pad = state.sandbox.pads[z];
        if (entityBelongsToAssemblyGroup(state, pad, groupId, groupField)) deleteSandboxPad(state, pad.id);
    }
    const rackId = `${groupId}:rack`;
    const meta = getSandboxEntityMeta(state);
    for (let i = state.worldProps.length - 1; i >= 0; i--) {
        const prop = state.worldProps[i];
        if (meta.getAssemblyRackId(prop.id) === rackId || entityBelongsToAssemblyGroup(state, prop, groupId, groupField)) removeWorldPropFromState(state, prop);
    }
    const idx = state.sandbox.assemblyInstances.findIndex((entry) => entry.id === groupId);
    if (idx >= 0) state.sandbox.assemblyInstances.splice(idx, 1);
}
/** @param {object} state */
export function clearAssemblyInstances(state) {
    const snapshot = state.sandbox.assemblyInstances.map((entry) => ({ id: entry.id, groupField: getResolvedAssembly(entry.assemblyId).groupField }));
    for (let i = 0; i < snapshot.length; i++) deleteAssemblyInstance(state, snapshot[i].id, snapshot[i].groupField);
}
