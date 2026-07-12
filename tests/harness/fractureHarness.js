import { FractureEngine, moduleStores, seedFractureRand } from "../../Libraries/Physics/fracture.js";
import { boxLocalFootprint } from "../../Libraries/Math/math.js";
import { ENGINE_F32, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT, F_OUT_ORIGIN_X, F_OUT_ORIGIN_Y, F_OUT_FACING, F_OUT_IMPACT_LOCAL_X, F_OUT_IMPACT_LOCAL_Y, F_OUT_IMPACT_FORCE } from "../../Core/engineMemory.js";
import { EntityRegistry } from "../../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../../Libraries/Sandbox/sandbox.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/spatial.js";
import { WorldProp } from "../../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../../Libraries/Props/props.js";
import { assignPhysIdWithPose } from "./kineticTickHarness.js";
import { createKineticSession } from "../../Libraries/Physics/physics.js";

export function createFractureWorld(overrides = {}) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    const world = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: createKineticSession(),
        sandbox: new SandboxWorldState(),
        spatialFrame: { evictKineticProp() {}, admitKineticProps() {} },
        ...overrides,
    };
    world.fractureEngine = new FractureEngine(world);
    return world;
}

export function liveFracturePropCount(world) {
    let count = 0;
    for (let i = 0; i < world.worldProps.length; i++) {
        const prop = world.worldProps[i];
        if (!prop.isDead && prop.type === "box") count++;
    }
    const debris = world.fractureEngine?.debris?.list();
    if (debris) {
        for (let i = 0; i < debris.length; i++) {
            const body = debris[i];
            if (!body.isDead && body.type === "box") count++;
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

function releaseDebrisGeom(stores, start, count) {
    const debris = stores.debris;
    for (let i = start; i < start + count; i++) if (debris.vertHandle[i]) stores.geom.release(debris.vertHandle[i]);
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

export function shatterPolygon(flatVerts, hitX, hitY, impactForce = 10, stores = moduleStores) {
    if (flatVerts.length < 6) return [];
    seedFractureRand(hitX, hitY, impactForce);
    stores.debris.reset();
    FractureEngine._shatterPolygonIntoStore(stores, flatVerts, hitX, hitY, impactForce);
    if (ENGINE_F32[F_OUT_DEBRIS_COUNT] < 2) {
        stores.debris.reset();
        return [];
    }
    const geometries = materializeDebrisGeometries(stores, ENGINE_F32[F_OUT_DEBRIS_START], ENGINE_F32[F_OUT_DEBRIS_COUNT]);
    releaseDebrisGeom(stores, ENGINE_F32[F_OUT_DEBRIS_START], ENGINE_F32[F_OUT_DEBRIS_COUNT]);
    stores.debris.reset();
    return geometries;
}

export function shatterFootprint(hx, hy, hitX, hitY, impactForce = 10) {
    return shatterPolygon(boxLocalFootprint(hx, hy), hitX, hitY, impactForce);
}

export function readImpactFracture(stores = moduleStores) {
    return {
        debrisStart: ENGINE_F32[F_OUT_DEBRIS_START],
        debrisCount: ENGINE_F32[F_OUT_DEBRIS_COUNT],
        originX: ENGINE_F32[F_OUT_ORIGIN_X],
        originY: ENGINE_F32[F_OUT_ORIGIN_Y],
        facing: ENGINE_F32[F_OUT_FACING],
        impactLocalX: ENGINE_F32[F_OUT_IMPACT_LOCAL_X],
        impactLocalY: ENGINE_F32[F_OUT_IMPACT_LOCAL_Y],
        impactForce: ENGINE_F32[F_OUT_IMPACT_FORCE],
        _stores: stores,
    };
}

export function spawnFractureShards(world, prop, impactForce = 30, hitX = 0, hitY = 0) {
    if (!FractureEngine.fracturePropOnImpact(prop, hitX, hitY, impactForce, world.fractureEngine)) return null;
    const stores = world.fractureEngine.stores;
    const fracture = readImpactFracture(stores);
    const shards = world.fractureEngine.debris.spawnShardsFromFracture(prop, fracture, stores);
    return { fracture, shards };
}

export function removeEditorPropFromWorld(world, prop) {
    const index = world.worldProps.indexOf(prop);
    if (index >= 0) world.worldProps.splice(index, 1);
    world.entityRegistry.unregister(prop);
    world.spatialFrame.evictKineticProp(prop, world.kinetic);
    prop.isDead = true;
}

export function createFracturableBox(x, y, hx, hy, facing = 0) {
    const prop = new WorldProp(x, y, "box", facing);
    setupPropForFracture(prop, hx, hy);
    return prop;
}
