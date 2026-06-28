import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { getCirclePropRadius, getPolygonPropBoundingRadius, setCirclePropRadius, setPolygonPropBoundingRadius } from "../Libraries/Props/propScale.js";
import { getBaseSpriteCacheKey } from "../Libraries/Props/propStrategy.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { WorldProp } from "../Entities/WorldProp.js";

const noopDeps = {
    quantizeAngleIndex: (a) => 0,
    buildRollOrientKey: () => "r0",
};

function createPropScaleTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 256, 256);
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
}

describe("propScale", () => {
    it("setCirclePropRadius updates shape, radius, and mass", () => {
        const state = createPropScaleTestState();
        const prop = spawnPlacedSandboxProp(state, 80, 80, "ball");
        assert.equal(getCirclePropRadius(prop), 4);
        setCirclePropRadius(prop, 2);
        assert.equal(getCirclePropRadius(prop), 2);
        assert.ok(prop.shape instanceof CircleShape);
        assert.equal(prop.shape.radius, 2);
        assert.ok(prop.mass > 0);
        assert.ok(prop.mass < spawnPlacedSandboxProp(state, 96, 96, "ball").mass);
    });

    it("setPolygonPropBoundingRadius rescales polygon props", () => {
        const wedge = new WorldProp(0, 0, "tri_wedge", 0);
        const baseline = getPolygonPropBoundingRadius(wedge);
        setPolygonPropBoundingRadius(wedge, 2);
        assert.ok(Math.abs(getPolygonPropBoundingRadius(wedge) - 2) < 0.01);
        assert.ok(wedge.shape.vertices.every((val) => Math.abs(val) <= 2.5));
        assert.ok(baseline > 9);
    });

    it("uses distinct sprite cache keys for quarter-step circle radii", () => {
        const state = createPropScaleTestState();
        const a = spawnPlacedSandboxProp(state, 80, 80, "ball");
        const b = spawnPlacedSandboxProp(state, 96, 96, "ball");
        setCirclePropRadius(a, 2);
        setCirclePropRadius(b, 2.25);
        assert.notEqual(getBaseSpriteCacheKey(a, noopDeps), getBaseSpriteCacheKey(b, noopDeps));
    });
});
