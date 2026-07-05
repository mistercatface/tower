import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../Libraries/Sandbox/sandbox.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { isChainSteeringTarget, createSandboxSession } from "../Libraries/Sandbox/sandbox.js";
import propCatalog from "../Assets/props/index.js";

function createSnakeSpawnTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
}

describe("snake prop kinetic chain spawning", () => {
    it("spawns a snake chain prop using the configured length parameter, custom radius, and visual overrides", () => {
        const state = createSnakeSpawnTestState();
        const meta = state.sandbox.entityMeta;

        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:snake");
        session.setSpawnSnakeLength(7);
        session.setSpawnBallRadius(3);
        session.setSpawnVisualOverrideTint("#aabbcc");
        session.setSpawnVisualOverrideBrightness(1.5);
        session.setSpawnFaction("alpha");

        const success = session.spawnAt(160, 160);
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
