import assert from "node:assert/strict";
import { describe, it } from "node:test";
import propCatalog from "../Assets/props/index.js";
import { kineticConstraintStore } from "../Core/engineMemory.js";
import { createSandboxKineticWorld, createSandboxControllerSession } from "./harness/stateFactories.js";
import { collectLiveWorldProps, liveWorldPropCount } from "./harness/fractureHarness.js";

describe("snake prop kinetic chain spawning", () => {
    it("spawns a snake chain prop using the configured length parameter and custom radius", () => {
        const state = createSandboxKineticWorld();
        const meta = state.sandbox.entityMeta;

        const session = createSandboxControllerSession(state);
        session.setPlacePaletteKey("prop:snake");
        session.setSpawnSnakeLength(7);
        session.setSpawnBallRadius(3);

        const success = session.spawnAt(160, 160);
        assert.ok(success);
        const props = collectLiveWorldProps(state.entityRegistry);
        assert.equal(liveWorldPropCount(state.entityRegistry), 7);

        const head = props[0];
        assert.equal(head.type, "snake");
        assert.ok(meta.isChainHead(head.id));
        assert.equal(head.wallChunkProfileId, "poolTableFelt");

        for (let i = 0; i < 7; i++) {
            assert.equal(props[i].radius, 3);
        }

        assert.equal(kineticConstraintStore.count, 6);

        for (let i = 0; i < kineticConstraintStore.count; i++) {
            assert.ok(kineticConstraintStore.restLength[i] > 0);
            assert.ok(Number.isFinite(kineticConstraintStore.restLength[i]));
        }
    });
});
