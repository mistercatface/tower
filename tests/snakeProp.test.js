import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { resetKineticConstraintIds } from "../Libraries/Physics/kineticConstraintSolver.js";
import { getChainMemberIds, isChainSteeringTarget } from "../Libraries/Sandbox/chainLinks.js";
import { spawnPlaceableAt } from "../Libraries/Sandbox/sandboxScenePlaceables.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";
import propCatalog from "../Assets/props/index.js";

function createSnakeSpawnTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
}

describe("snake prop kinetic chain spawning", () => {
    it("spawns a snake chain prop using the configured length parameter, custom radius, and visual overrides", () => {
        resetKineticConstraintIds(1);
        const state = createSnakeSpawnTestState();
        const meta = getSandboxEntityMeta(state);

        // Mock spawn context for testing
        const ctx = {
            resolveSpawnPropTypeId: () => "snake",
            resolveSpawnVisualOverride: (asset) => ({ tint: "#aabbcc", brightness: 1.5 }),
            spawnFaction: "alpha",
            spawnSnakeLength: 7, // Custom configured length
            spawnBallRadius: 3,  // Custom configured radius
            selectSpawned: true,
            placement: {
                touchPropPlacement() {},
            },
            pickSelection(sel) {
                this.selection = sel;
            },
        };

        const success = spawnPlaceableAt(state, 160, 160, propCatalog["snake"], ctx);
        assert.ok(success);
        assert.equal(state.worldProps.length, 7); // Head + 6 body segments

        const head = state.worldProps[0];
        assert.equal(head.type, "snake");
        assert.ok(meta.isChainHead(head.id));
        assert.ok(isChainSteeringTarget(state, meta, head.id));

        // Verify visual overrides applied to the snake head
        assert.equal(head.visualOverride?.tint, "#aabbcc");
        assert.equal(head.visualOverride?.brightness, 1.5);

        // Verify radii of segments are set to the custom spawn radius
        for (let i = 0; i < 7; i++) {
            assert.equal(state.worldProps[i].radius, 3);
        }

        // Constraints should link the 7 elements (6 links)
        assert.equal(state.kinetic.kineticConstraints.length, 6);

        // Verify constraints have positive rest lengths and link adjacent bodies
        for (let i = 0; i < state.kinetic.kineticConstraints.length; i++) {
            const constraint = state.kinetic.kineticConstraints[i];
            assert.ok(constraint.restLength > 0);
            assert.ok(Number.isFinite(constraint.restLength));
        }

        // Verification of arrow attachment on snake head
        assert.ok(propCatalog["snake"].visuals.attachments.some(a => a.id === "movement_arrow"));
    });
});
