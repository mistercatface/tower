import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { CircleShape, PolygonShape, kineticFootprintArea, kineticInertiaFromBody, kineticMassFromFootprint, stampPrimitivePhysics, normalizeKineticBody } from "../Libraries/Physics/physics.js";
import { polygonSecondMomentAboutCentroid2D, polygonSignedArea2D } from "../Libraries/Math/math.js";
import { primitivePhysics, kineticStaticSlab } from "../Core/engineMemory.js";
import { PRIMITIVE_PHYSICS_ROW_CIRCLE, PRIMITIVE_PHYSICS_ROW_POLYGON } from "../Core/engineEnums.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
describe("bodyMass", () => {
    it("scales mass with polygon footprint area", () => {
        const smallVerts = new Float32Array([
            -8, -8,
            8, -8,
            8, 8,
            -8, 8,
        ]);
        const largeVerts = new Float32Array([
            -16, -16,
            16, -16,
            16, 16,
            -16, 16,
        ]);
        const small = { shape: new PolygonShape(smallVerts), strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_POLYGON) };
        const large = { shape: new PolygonShape(largeVerts), strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_POLYGON) };
        assert.equal(kineticFootprintArea(small), 256);
        assert.equal(kineticFootprintArea(large), 1024);
        assert.ok(kineticMassFromFootprint(large) > kineticMassFromFootprint(small));
    });
    it("kineticFootprintArea uses stored material area when collision hull is larger", () => {
        const body = {
            strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_POLYGON),
            footprintArea: 100,
            shape: new PolygonShape(new Float32Array([
                -10, -10,
                10, -10,
                10, 10,
                -10, 10,
            ])),
        };
        assert.equal(kineticFootprintArea(body), 100);
    });

    it("derives circle mass from table density and radius", () => {
        const density = primitivePhysics.density[PRIMITIVE_PHYSICS_ROW_CIRCLE];
        const body = { strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_CIRCLE), radius: 10, shape: new CircleShape(10) };
        assert.ok(Math.abs(kineticMassFromFootprint(body) - density * Math.PI * 100) < 1e-6);
    });
    it("kineticFootprintArea uses polygon vertices when present", () => {
        const boxVerts = new Float32Array([
            -16, -8,
            16, -8,
            16, 8,
            -16, 8,
        ]);
        const body = { shape: new PolygonShape(boxVerts), strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_POLYGON) };
        assert.equal(kineticFootprintArea(body), 512);
        assert.equal(kineticMassFromFootprint(body), 3);
    });
    it("rectangle polygon inertia matches thin plate formula", () => {
        const w = 32;
        const h = 16;
        const verts = new Float32Array([
            -w / 2, -h / 2,
            w / 2, -h / 2,
            w / 2, h / 2,
            -w / 2, h / 2,
        ]);
        const area = Math.abs(polygonSignedArea2D(verts));
        const inertiaFactor = polygonSecondMomentAboutCentroid2D(verts) / area;
        const body = {
            shape: new PolygonShape(verts),
            strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_POLYGON),
        };
        assert.ok(Math.abs(inertiaFactor - (w * w + h * h) / 12) < 1e-6);
        const mass = kineticMassFromFootprint(body);
        assert.ok(Math.abs(kineticInertiaFromBody(body) - (mass * (w * w + h * h)) / 12) < 1e-6);
    });
    it("tri wedge mass uses triangle area not bounding box", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0);
        const triangleArea = Math.abs(polygonSignedArea2D(prop.shape.vertices));
        const aabbArea = 18 * 15;
        assert.equal(triangleArea, 135);
        assert.ok(triangleArea < aabbArea);
        assert.equal(kineticFootprintArea(prop), triangleArea);
        const mass = kineticMassFromFootprint(prop);
        assert.ok(Math.abs(kineticInertiaFromBody(prop) - mass * (polygonSecondMomentAboutCentroid2D(prop.shape.vertices) / triangleArea)) < 1e-6);
    });
    it("ball default density matches canonical asset", () => {
        const prop = new WorldProp(0, 0, "ball", 0);
        assert.ok(Math.abs(primitivePhysics.density[prop.strategy.physicsRow] - 0.007958) < 1e-6);
        assert.ok(kineticMassFromFootprint(prop) > 0);
        assignPhysIdWithPose(prop, 0);
        normalizeKineticBody(prop);
        assert.ok(kineticStaticSlab.mass[prop._physId] > 0);
    });
});
