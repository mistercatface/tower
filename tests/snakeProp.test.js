import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChainSteeringTarget, createSandboxSession } from "../Libraries/Sandbox/sandbox.js";
import propCatalog from "../Assets/props/index.js";
import { kineticConstraintStore } from "../Core/engineMemory.js";
import { createSandboxKineticWorld } from "./harness/stateFactories.js";

describe("snake prop kinetic chain spawning", () => {
    it("spawns a snake chain prop using the configured length parameter and custom radius", () => {
        const state = createSandboxKineticWorld();
        const meta = state.sandbox.entityMeta;

        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:snake");
        session.setSpawnSnakeLength(7);
        session.setSpawnBallRadius(3);
        session.setSpawnFaction("alpha");

        const success = session.spawnAt(160, 160);
        assert.ok(success);
        assert.equal(state.worldProps.length, 7); // Head + 6 body segments

        const head = state.worldProps[0];
        assert.equal(head.type, "snake");
        assert.ok(meta.isChainHead(head.id));
        assert.ok(isChainSteeringTarget(state, meta, head.id));
        assert.equal(head.wallChunkProfileId, "poolTableFelt");
        assert.equal(head.visualOverride?.tint, undefined);

        // Verify radii of segments are set to the custom spawn radius
        for (let i = 0; i < 7; i++) {
            assert.equal(state.worldProps[i].radius, 3);
        }

        // Constraints should link the 7 elements (6 links)
        assert.equal(kineticConstraintStore.count, 6);

        for (let i = 0; i < kineticConstraintStore.count; i++) {
            assert.ok(kineticConstraintStore.restLength[i] > 0);
            assert.ok(Number.isFinite(kineticConstraintStore.restLength[i]));
        }

        // Verification of arrow attachment on snake head
        assert.ok(propCatalog["snake"].visuals.attachments.some(a => a.id === "movement_arrow"));
    });
});
