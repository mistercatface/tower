import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import { getCirclePropRadius, setCirclePropRadius, getPolygonPropBoundingRadius, setPolygonPropBoundingRadius } from "../Libraries/Props/props.js";
import { getBaseSpriteCacheKey } from "../Libraries/Props/props.js";
import { CircleShape } from "../Libraries/Physics/physics.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { createSandboxKineticWorld } from "./harness/stateFactories.js";

const noopDeps = {
    quantizeAngleIndex: (a) => 0,
};

describe("propScale", () => {
    it("setPropRadius updates shape, radius, and mass", () => {
        const state = createSandboxKineticWorld(16, 16);
        const prop = spawnPlacedSandboxProp(state, 80, 80, "ball", "alpha");
        assert.equal(getCirclePropRadius(prop), 4);
        setCirclePropRadius(prop, 2);
        assert.equal(getCirclePropRadius(prop), 2);
        assert.ok(prop.shape instanceof CircleShape);
        assert.equal(prop.shape.radius, 2);
        assert.ok(prop.mass > 0);
        assert.ok(prop.mass < spawnPlacedSandboxProp(state, 96, 96, "ball", "alpha").mass);
    });

    it("setPropRadius rescales polygon props", () => {
        const wedge = new WorldProp(0, 0, "tri_wedge", 0);
        const baseline = getPolygonPropBoundingRadius(wedge);
        setPolygonPropBoundingRadius(wedge, 2);
        assert.ok(Math.abs(getPolygonPropBoundingRadius(wedge) - 2) < 0.01);
        assert.ok(wedge.shape.vertices.every((val) => Math.abs(val) <= 2.5));
        assert.ok(baseline > 9);
    });

    it("uses distinct sprite cache keys for quarter-step circle radii", () => {
        const state = createSandboxKineticWorld(16, 16);
        const a = spawnPlacedSandboxProp(state, 80, 80, "ball", "alpha");
        const b = spawnPlacedSandboxProp(state, 96, 96, "ball", "alpha");
        setCirclePropRadius(a, 2);
        setCirclePropRadius(b, 2.25);
        assert.notEqual(getBaseSpriteCacheKey(a, noopDeps), getBaseSpriteCacheKey(b, noopDeps));
    });
});
