import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bakePoxelOutline, localBoxOutline } from "../Libraries/Props/poxelFracture.js";
import {
    applyPoxelGeometryToProp,
    fractureSplittableOnImpact,
    impactForceFromContact,
    initSplittableFootprint,
    splitFootprintIntoComponents,
    worldHitToPropLocal,
} from "../Libraries/Props/splittableWorldProp.js";
function makeSplittableProp(hx = 8, hy = 8) {
    const prop = {
        halfExtents: { x: hx, y: hy },
        radius: Math.max(hx, hy),
        poxels: null,
        strategy: { splittable: true, collisionShape: "box" },
        x: 100,
        y: 200,
        facing: 0,
        vx: 0,
        vy: 0,
        angularVelocity: 0,
        mass: 1.5,
        footprintArea: 0,
        spawnSplittableFragments(_state, debris) {
            this.spawnedDebris = debris;
        },
    };
    initSplittableFootprint(prop);
    return prop;
}
describe("splittable impact fracture", () => {
    it("worldHitToPropLocal maps world hits into prop space", () => {
        const prop = { x: 100, y: 200, facing: Math.PI / 2 };
        const local = worldHitToPropLocal(prop, 100, 210);
        assert.ok(Math.abs(local.x - 10) < 1e-6);
        assert.ok(Math.abs(local.y - 0) < 1e-6);
    });
    it("impactForceFromContact scales with relative speed", () => {
        assert.ok(impactForceFromContact(200) > impactForceFromContact(50));
    });
    it("splitFootprintIntoComponents localizes breaks away from center hit", () => {
        const prop = makeSplittableProp();
        const center = splitFootprintIntoComponents(prop, 0, 0, 80, false);
        const edge = splitFootprintIntoComponents(prop, 7, 0, 80, false);
        assert.ok(center.length > 1);
        assert.ok(edge.length >= 1);
        assert.ok(center.length >= edge.length);
    });
    it("fractureSplittableOnImpact keeps largest piece on parent and returns debris", () => {
        const prop = makeSplittableProp(12, 12);
        const initialPoxels = prop.poxels.length;
        const fracture = fractureSplittableOnImpact(prop, 100, 200, 80);
        assert.ok(fracture);
        assert.ok(prop.poxels.length < initialPoxels);
        assert.ok(fracture.debris.length > 0);
        assert.ok(prop.footprintArea > 0);
        for (const geom of fracture.debris) assert.ok(geom.footprintArea <= prop.footprintArea);
    });
    it("bigger footprints bake more poxels", () => {
        const small = bakePoxelOutline(localBoxOutline(8, 8));
        const large = bakePoxelOutline(localBoxOutline(24, 16));
        assert.ok(large.poxels.length > small.poxels.length);
    });
    it("applyPoxelGeometryToProp rebakes collision for custom half extents", () => {
        const prop = makeSplittableProp(20, 10);
        applyPoxelGeometryToProp(prop, bakePoxelOutline(localBoxOutline(20, 10)));
        assert.equal(prop.halfExtents.x, 20);
        assert.equal(prop.halfExtents.y, 10);
        assert.ok(prop.poxels.length > 1);
    });
});
