import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { worldPropAssets } from "../Libraries/Props/PropCatalog.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { fanTriangulateFromOrigin, regularStarFootprint } from "../Libraries/Math/Poly2D.js";
import { resolveSnakePropRadius } from "../Libraries/Game/snake/snakeGameConfig.js";

describe("goal_orb star", () => {
    it("uses a five-point star footprint at outer radius 2", () => {
        const asset = worldPropAssets["goal_orb"];
        assert.equal(asset.physics.radius, 2);
        assert.deepEqual(asset.physics.localFootprint, regularStarFootprint(5, 2, 0.85));
    });

    it("spawns as a polygon trigger with bounding radius 2", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        const state = { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
        const goal = spawnPlacedSandboxProp(state, 80, 80, "goal_orb");
        assert.equal(goal.strategy.spatialRole, "trigger");
        assert.equal(goal.shape.type, "Polygon");
        assert.equal(goal.shape.vertices.length, 10);
        assert.equal(resolveSnakePropRadius("goal_orb"), 2);
        assert.ok(goal.radius <= 2.25);
        assert.equal(fanTriangulateFromOrigin(goal.shape.vertices).length, 10);
    });
});
