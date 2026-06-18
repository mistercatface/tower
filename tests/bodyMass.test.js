import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { kineticFootprintArea, kineticInertiaFromBody, kineticMassFromFootprint, syncKineticRigidBody } from "../Libraries/Motion/bodyMass.js";
import { polygonSecondMomentAboutCentroid2D, polygonSignedArea2D } from "../Libraries/Math/Poly2D.js";
loadPropAssets();
describe("bodyMass", () => {
    it("scales splittable mass with footprint area", () => {
        const small = { footprintArea: 256, strategy: {} };
        const large = { footprintArea: 1024, strategy: {} };
        syncKineticRigidBody(small);
        syncKineticRigidBody(large);
        assert.ok(large.mass > small.mass);
        assert.ok(Math.abs(large.mass / small.mass - 4) < 1e-6);
    });
    it("uses authored strategy mass when no baked footprint", () => {
        const body = { footprintArea: 0, strategy: { mass: 1.5 }, radius: 8, halfExtents: { x: 8, y: 8 } };
        syncKineticRigidBody(body);
        assert.equal(body.mass, 1.5);
    });
    it("kineticFootprintArea uses polygon vertices when present", () => {
        const boxVerts = [
            { x: -16, y: -8 },
            { x: 16, y: -8 },
            { x: 16, y: 8 },
            { x: -16, y: 8 },
        ];
        const body = { shape: { type: "Polygon", vertices: boxVerts } };
        assert.equal(kineticFootprintArea(body), 512);
        assert.equal(kineticMassFromFootprint(body), 3);
    });
    it("kineticFootprintArea falls back to half extents when polygon has no vertices", () => {
        const body = { halfExtents: { x: 16, y: 8 }, shape: { type: "Polygon" } };
        assert.equal(kineticFootprintArea(body), 512);
    });
    it("rectangle polygon inertia matches thin plate formula", () => {
        const w = 32;
        const h = 16;
        const verts = [
            { x: -w / 2, y: -h / 2 },
            { x: w / 2, y: -h / 2 },
            { x: w / 2, y: h / 2 },
            { x: -w / 2, y: h / 2 },
        ];
        const area = Math.abs(polygonSignedArea2D(verts));
        const inertiaFactor = polygonSecondMomentAboutCentroid2D(verts) / area;
        const body = { mass: 2, shape: { type: "Polygon", vertices: verts } };
        assert.ok(Math.abs(inertiaFactor - (w * w + h * h) / 12) < 1e-6);
        assert.ok(Math.abs(kineticInertiaFromBody(body) - (2 * (w * w + h * h)) / 12) < 1e-6);
    });
    it("tri wedge mass uses triangle area not bounding box", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0);
        const triangleArea = Math.abs(polygonSignedArea2D(prop.shape.vertices));
        const aabbArea = 18 * 15;
        assert.equal(triangleArea, 135);
        assert.ok(triangleArea < aabbArea);
        assert.equal(kineticFootprintArea(prop), triangleArea);
        syncKineticRigidBody(prop);
        assert.ok(Math.abs(prop.mass - kineticMassFromFootprint(prop)) < 1e-6);
        assert.ok(Math.abs(kineticInertiaFromBody(prop) - prop.mass * (polygonSecondMomentAboutCentroid2D(prop.shape.vertices) / triangleArea)) < 1e-6);
    });
    it("localFootprint props ignore authored strategy mass", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0);
        prop.strategy.mass = 99;
        syncKineticRigidBody(prop);
        assert.ok(prop.mass < 1);
        assert.ok(Math.abs(prop.mass - kineticMassFromFootprint(prop)) < 1e-6);
    });
});
