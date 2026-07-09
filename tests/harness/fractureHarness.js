import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { EntityRegistry } from "../../GameState/EntityRegistry.js";
import { KineticSession } from "../../GameState/KineticSession.js";
import { SandboxWorldState } from "../../Libraries/Sandbox/sandbox.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/spatial.js";
import { WorldProp } from "../../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../../Libraries/Props/props.js";
import { kineticDynamicSlab } from "../../Libraries/Physics/physics.js";

export function createFractureWorld(overrides = {}) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    const world = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        spatialFrame: { evictKineticProp() {}, admitKineticProps() {} },
        ...overrides,
    };
    world.fractureEngine = new FractureEngine(world);
    return world;
}

export function liveGlassCount(world) {
    let count = 0;
    for (let i = 0; i < world.worldProps.length; i++) {
        const prop = world.worldProps[i];
        if (!prop.isDead && prop.type === "glass_pane") count++;
    }
    const debris = world.fractureEngine?.debris?.list();
    if (debris) {
        for (let i = 0; i < debris.length; i++) {
            const body = debris[i];
            if (!body.isDead && body.type === "glass_pane") count++;
        }
    }
    return count;
}

export function setupGlassPaneForFracture(prop, hx, hy, physId = 0) {
    prop._physId = physId;
    kineticDynamicSlab.x[physId] = prop.x;
    kineticDynamicSlab.y[physId] = prop.y;
    applyPropBoxFootprint(prop, hx, hy);
    return prop;
}

export function spawnGlassFractureShards(world, prop, impactForce = 30, hitX = 0, hitY = 0) {
    const fracture = FractureEngine.fracturePropOnImpact(prop, hitX, hitY, impactForce);
    if (!fracture) return null;
    const stores = fracture._stores ?? world.fractureEngine.stores;
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

export function createGlassPane(x, y, hx, hy, facing = 0) {
    const prop = new WorldProp(x, y, "glass_pane", facing);
    setupGlassPaneForFracture(prop, hx, hy);
    return prop;
}
