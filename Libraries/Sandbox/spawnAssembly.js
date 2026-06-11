import { getWallHeight } from "../WorldSurface/WorldSurfaceSettings.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { SceneCompiler } from "../Render/Scene/SceneCompiler.js";
import { createVoidZone } from "../Spatial/zones/voidZone.js";
import { createGravityZone } from "../Spatial/zones/groundZones.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { Pickup } from "../../Entities/Pickup.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { buildAssemblyLayout, buildAssemblyClearBounds, buildAssemblyWallSegments } from "./assemblyLayout.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { stampAssemblyGroupMember, entityBelongsToAssemblyGroup } from "./assemblies/assemblyLink.js";
import { createAssemblySurfaceZone } from "./assemblySurfaceDraw.js";
import { eagerBakeAssemblySurfaceFlipbook, releaseAssemblySurfaceFlipbook } from "./assemblySurfaceBake.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { applyFlipperAssemblyScale } from "./behaviors/flipperBehavior.js";
import { attachPropButton } from "./propAttachedButton.js";
import { applyPinballObstacleScale } from "./pinballObstacleScale.js";
/** @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved @param {string} propId */
function assemblyIncludesProp(resolved, propId) {
    if (!resolved.props.length) return true;
    return resolved.props.includes(propId);
}
/** @param {string[]} spawnSteps @param {string[]} names */
function spawnIncludes(spawnSteps, names) {
    for (let i = 0; i < names.length; i++) if (spawnSteps.includes(names[i])) return true;
    return false;
}
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
/** @param {object} state @param {object[]} walls @param {{ compileRender?: boolean }} [options] */
function addSandboxWalls(state, walls, { compileRender = true } = {}) {
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
        if (scene && compileRender && !wall.collisionOnly) SceneCompiler.compileWall(wall, scene, defaultWallHeight);
    }
    if (compileRender) state.worldSurfaces?.invalidateRoofs();
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
        state.worldSurfaces?.worldSurfaceSeed ?? 0,
    )
        .then((flipbook) => {
            if (zone.bakeGeneration !== bakeGeneration) {
                releaseAssemblySurfaceFlipbook(flipbook);
                return;
            }
            zone.flipbook = flipbook;
            requestUiUpdate();
        })
        .catch((err) => console.error("assembly surface bake failed:", err));
    return zone;
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {ReturnType<typeof buildAssemblyLayout>} layout
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {{ faction?: string, groupId: string, rackId: string, groupField: string }} options
 */
function spawnManifestPickups(host, layout, resolved, { faction, groupId, rackId, groupField }) {
    /** @type {string | null} */
    let cueBallId = null;
    for (let i = 0; i < resolved.pickups.length; i++) {
        const entry = resolved.pickups[i];
        if (!assemblyIncludesProp(resolved, entry.prop) || !getPropAsset(entry.prop)) return null;
        const at = resolvePlacement(layout.play, entry.at);
        const pickup = new Pickup(at.x, at.y, entry.prop, entry.facing ?? 0);
        pickup.faction = faction;
        pickup.assemblyRackId = rackId;
        stampAssemblyGroupMember(pickup, groupId, resolved.id, groupField);
        const asset = getPropAsset(entry.prop);
        if (asset?.flipper) applyFlipperAssemblyScale(pickup, layout, asset);
        else if (asset?.physics?.radiusU != null) applyPinballObstacleScale(pickup, layout, asset);
        if (entry.button) attachPropButton(pickup, layout, entry.button);
        const behavior = resolved.behaviors[entry.prop];
        if (behavior) pickup.sandboxBehaviorOverrides = behavior;
        wakePushableBody(pickup);
        host.addPickup(pickup);
        if (entry.id === "cue") cueBallId = pickup.id;
    }
    return { cueBallId };
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {number} centerX
 * @param {number} centerY
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {{ faction?: string, groupId?: string }} [options]
 */
export function spawnResolvedAssembly(host, centerX, centerY, resolved, { faction, groupId: groupIdOverride } = {}) {
    const state = host.getWorldState();
    if (!resolved.pickups.length) return null;
    for (let i = 0; i < resolved.pickups.length; i++) {
        const entry = resolved.pickups[i];
        if (!assemblyIncludesProp(resolved, entry.prop) || !getPropAsset(entry.prop)) return null;
    }
    const layout = buildAssemblyLayout(centerX, centerY, resolved);
    const spawnSteps = resolved.spawn;
    if (spawnIncludes(spawnSteps, ["arena.clear"])) clearWallsInBounds(state, buildAssemblyClearBounds(layout, resolved));
    const groupId = groupIdOverride ?? `${resolved.id}:${Date.now()}`;
    const rackId = `${groupId}:rack`;
    const groupField = resolved.groupField;
    const flatSurface = Boolean(resolved.surfaceProfileId);
    registerAssemblyPlayfieldSurface(state, layout, resolved, groupId, groupField);
    const arenaWidth = resolved.arena.width;
    const arenaHeight = resolved.arena.height;
    if (spawnIncludes(spawnSteps, ["arena.walls"])) {
        const walls = buildAssemblyWallSegments(layout, resolved, { collisionOnly: flatSurface });
        for (let i = 0; i < walls.length; i++) stampAssemblyGroupMember(walls[i], groupId, resolved.id, groupField);
        addSandboxWalls(state, walls, { compileRender: true });
    }
    if (spawnIncludes(spawnSteps, ["voidCircles"]))
        for (let p = 0; p < layout.voids.length; p++) {
            const voidCircle = layout.voids[p];
            const zone = createVoidZone(voidCircle.x, voidCircle.y, voidCircle.radius, { id: `${groupId}:void:${voidCircle.id ?? p + 1}`, depth: voidCircle.depth });
            stampAssemblyGroupMember(zone, groupId, resolved.id, groupField);
            state.sandboxVoidZones.push(zone);
        }
    if (spawnIncludes(spawnSteps, ["gravityZones"]))
        for (let g = 0; g < layout.gravityZones.length; g++) {
            const gz = layout.gravityZones[g];
            const zone = createGravityZone(gz.x, gz.y, gz.halfWidth, gz.halfHeight, { id: `${groupId}:gravity:${gz.id ?? g + 1}`, forceX: gz.forceX, forceY: gz.forceY });
            stampAssemblyGroupMember(zone, groupId, resolved.id, groupField);
            state.sandboxGravityZones.push(zone);
        }
    let spawned = null;
    if (spawnIncludes(spawnSteps, ["pickups"])) {
        spawned = spawnManifestPickups(host, layout, resolved, { faction, groupId, rackId, groupField });
        if (!spawned) return null;
    }
    const instance = { id: groupId, assemblyId: resolved.id, rackId, cueBallId: spawned?.cueBallId ?? null, arenaWidth, arenaHeight, groupField };
    state.sandboxAssemblyInstances.push(instance);
    return { id: groupId, assemblyId: resolved.id, cueBallId: spawned?.cueBallId ?? null, centerX, centerY };
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
    return spawnResolvedAssembly(host, centerX, centerY, resolved, options);
}
/** @param {object} state @param {string} groupId @param {string} [groupField] */
export function deleteAssemblyInstance(state, groupId, groupField = "sandboxGroupId") {
    for (let z = state.sandboxSurfaceProfileZones.length - 1; z >= 0; z--) {
        const zone = state.sandboxSurfaceProfileZones[z];
        if (!entityBelongsToAssemblyGroup(zone, groupId, groupField)) continue;
        zone.bakeGeneration++;
        releaseAssemblySurfaceFlipbook(zone.flipbook);
        zone.flipbook = null;
        state.sandboxSurfaceProfileZones.splice(z, 1);
    }
    for (let i = state.walls.length - 1; i >= 0; i--) if (entityBelongsToAssemblyGroup(state.walls[i], groupId, groupField)) removeSandboxWall(state, state.walls[i]);
    for (let z = state.sandboxVoidZones.length - 1; z >= 0; z--) if (entityBelongsToAssemblyGroup(state.sandboxVoidZones[z], groupId, groupField)) state.sandboxVoidZones.splice(z, 1);
    if (state.sandboxGravityZones)
        for (let z = state.sandboxGravityZones.length - 1; z >= 0; z--) if (entityBelongsToAssemblyGroup(state.sandboxGravityZones[z], groupId, groupField)) state.sandboxGravityZones.splice(z, 1);
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
    if (!state.sandboxAssemblyInstances.length) return;
    const ids = state.sandboxAssemblyInstances.map((entry) => entry.id);
    for (let i = 0; i < ids.length; i++) deleteAssemblyInstance(state, ids[i]);
}
