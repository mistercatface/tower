import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { inverseMassFromBody, kineticDensity, kineticFootprintArea, kineticInertiaFromBody, kineticMassFromFootprint, syncKineticRigidBody } from "../Libraries/Motion/bodyMass.js";
import { polygonSecondMomentAboutCentroid2D, polygonSignedArea2D } from "../Libraries/Math/Poly2D.js";
loadPropAssets();
describe("bodyMass", () => {
    it("scales mass with polygon footprint area", () => {
        const smallVerts = [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
        ];
        const largeVerts = [
            { x: -16, y: -16 },
            { x: 16, y: -16 },
            { x: 16, y: 16 },
            { x: -16, y: 16 },
        ];
        const small = { strategy: {}, shape: { type: "Polygon", vertices: smallVerts } };
        const large = { strategy: {}, shape: { type: "Polygon", vertices: largeVerts } };
        syncKineticRigidBody(small);
        syncKineticRigidBody(large);
        assert.ok(large.mass > small.mass);
        assert.ok(Math.abs(large.mass / small.mass - 4) < 1e-6);
    });
    it("kineticFootprintArea uses stored material area when collision hull is larger", () => {
        const body = {
            strategy: {},
            footprintArea: 100,
            shape: {
                type: "Polygon",
                vertices: [
                    { x: -10, y: -10 },
                    { x: 10, y: -10 },
                    { x: 10, y: 10 },
                    { x: -10, y: 10 },
                ],
            },
        };
        assert.equal(kineticFootprintArea(body), 100);
    });

    it("derives circle mass from density and radius", () => {
        const body = { strategy: { density: 0.01 }, radius: 10, shape: { type: "Circle", radius: 10 } };
        syncKineticRigidBody(body);
        assert.ok(Math.abs(body.mass - 0.01 * Math.PI * 100) < 1e-6);
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
    it("pinned bodies have zero inverse mass", () => {
        const body = { mass: 5, strategy: { pinned: true } };
        assert.equal(inverseMassFromBody(body), 0);
    });
    it("beach ball asset density preserves prior feel", () => {
        const prop = new WorldProp(0, 0, "beach_ball", 0);
        assert.ok(Math.abs(kineticDensity(prop) - 0.003898) < 1e-6);
        syncKineticRigidBody(prop);
        assert.ok(Math.abs(prop.mass - 0.6) < 0.01);
    });
});
