import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    kineticFootprintArea,
    kineticMassFromFootprint,
    syncKineticRigidBody,
} from "../Libraries/Motion/bodyMass.js";

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
    it("kineticFootprintArea falls back to box half extents", () => {
        const body = { halfExtents: { x: 16, y: 8 }, shape: { type: "Polygon" } };
        assert.equal(kineticFootprintArea(body), 512);
        assert.equal(kineticMassFromFootprint(body), 3);
    });
});
