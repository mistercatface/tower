import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { boxLocalFootprint } from "../../Libraries/Math/math.js";
import { ENGINE_F32, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT, entityRefs, entityKind } from "../../Core/engineMemory.js";
import { EntityRegistry } from "../../GameState/EntityRegistry.js";
import { ENTITY_KIND_WORLD_PROP, ENTITY_KIND_DEBRIS } from "../../Core/engineEnums.js";
import { SandboxWorldState } from "../../Libraries/Sandbox/sandbox.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/spatial.js";
import { WorldProp } from "../../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../../Libraries/Props/props.js";
import { assignPhysIdWithPose } from "./kineticTickHarness.js";
import { createKineticSession, writeLivePolygon, normalizeKineticBody } from "../../Libraries/Physics/physics.js";
import { releaseEntityEid } from "../../Core/entitySlots.js";

function stubEvictKineticEid(eid) {
    const prop = entityRefs[eid];
    if (prop) delete prop._physId;
    releaseEntityEid(eid);
}
export { stubEvictKineticEid };

export function createFractureWorld(overrides = {}) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    const world = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        kinetic: createKineticSession(),
        sandbox: new SandboxWorldState(),
        spatialFrame: { evictKineticEid: stubEvictKineticEid, admitKineticEids() {} },
        ...overrides,
    };
    world.fractureEngine = new FractureEngine(world);
    return world;
}

export function liveWorldPropCount(registry) {
    let count = 0;
    registry.forEachOfKind(ENTITY_KIND_WORLD_PROP, (prop) => {
        if (prop.isDead) return;
        count++;
    });
    return count;
}

export function collectLiveWorldProps(registry) {
    const props = [];
    registry.forEachOfKind(ENTITY_KIND_WORLD_PROP, (prop) => {
        if (prop.isDead) return;
        props.push(prop);
    });
    return props;
}

export function liveDebrisBodies(store) {
    const out = [];
    for (let i = 0; i < store.liveCount; i++) out.push(entityRefs[store.liveEids[i]]);
    return out;
}

export function assertDebrisKind(body) {
    return entityKind[body._physId] === ENTITY_KIND_DEBRIS;
}

export function liveFracturePropCount(world) {
    let count = 0;
    world.entityRegistry.forEachOfKind(ENTITY_KIND_WORLD_PROP, (prop) => {
        if (prop.isDead) return;
        if (prop.type === "box") count++;
    });
    const store = world.fractureEngine?.debris;
    if (store) {
        for (let i = 0; i < store.liveCount; i++) {
            const body = entityRefs[store.liveEids[i]];
            if (body && !body.isDead && body.type === "box") count++;
        }
    }
    return count;
}

export function setupPropForFracture(prop, hx, hy, physId = 0) {
    prop.fractureEnabled = true;
    assignPhysIdWithPose(prop, physId);
    applyPropBoxFootprint(prop, hx, hy);
    return prop;
}

export function materializeDebrisGeometries(stores, debrisStart, debrisCount) {
    const geometries = [];
    const debris = stores.debris;
    for (let i = debrisStart; i < debrisStart + debrisCount; i++) {
        const handle = debris.vertHandle[i];
        const vertCount = debris.vertCount[i];
        const src = stores.geom.buffer(handle);
        const n = vertCount * 2;
        const footprintVertices = new Float32Array(n);
        for (let j = 0; j < n; j++) footprintVertices[j] = src[j];
        geometries.push({
            footprintVertices,
            footprintArea: debris.footprintArea[i],
            boundingRadius: debris.boundingRadius[i],
            centroid: { cx: debris.centroidX[i], cy: debris.centroidY[i] },
        });
    }
    return geometries;
}

let geometryShatterWorld = null;
function geometryShatterEngine() {
    if (!geometryShatterWorld) geometryShatterWorld = createFractureWorld();
    return geometryShatterWorld.fractureEngine;
}

export function shatterPolygon(flatVerts, hitX, hitY, impactForce = 10) {
    if (flatVerts.length < 6) return [];
    const engine = geometryShatterEngine();
    const stores = engine.stores;
    stores.debris.reset();
    const prop = new WorldProp(0, 0, "box", 0);
    prop.fractureEnabled = true;
    writeLivePolygon(prop, flatVerts, flatVerts.length);
    normalizeKineticBody(prop);
    if (!FractureEngine.fracturePropOnImpact(prop, hitX, hitY, impactForce, engine)) {
        stores.debris.reset();
        return [];
    }
    if (ENGINE_F32[F_OUT_DEBRIS_COUNT] < 2) {
        stores.debris.reset();
        return [];
    }
    const debrisStart = ENGINE_F32[F_OUT_DEBRIS_START];
    const debrisCount = ENGINE_F32[F_OUT_DEBRIS_COUNT];
    const geometries = materializeDebrisGeometries(stores, debrisStart, debrisCount);
    const debris = stores.debris;
    for (let i = debrisStart; i < debrisStart + debrisCount; i++) if (debris.vertHandle[i]) stores.geom.release(debris.vertHandle[i]);
    stores.debris.reset();
    return geometries;
}

export function shatterFootprint(hx, hy, hitX, hitY, impactForce = 10) {
    return shatterPolygon(boxLocalFootprint(hx, hy), hitX, hitY, impactForce);
}

export function spawnFractureShards(world, prop, impactForce = 30, hitX = 0, hitY = 0) {
    if (!FractureEngine.fracturePropOnImpact(prop, hitX, hitY, impactForce, world.fractureEngine)) return null;
    const shards = world.fractureEngine.debris.spawnShardsFromFracture(prop);
    return { shards };
}

export function removeEditorPropFromWorld(world, prop) {
    world.entityRegistry.unregister(prop);
    world.spatialFrame.evictKineticEid(prop._physId, world.kinetic);
    prop.isDead = true;
}

export function createFracturableBox(x, y, hx, hy, facing = 0) {
    const prop = new WorldProp(x, y, "box", facing);
    setupPropForFracture(prop, hx, hy);
    return prop;
}
