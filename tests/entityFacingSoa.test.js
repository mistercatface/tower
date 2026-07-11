import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { entityFacing as entityFacingFn } from "../Libraries/Physics/physics.js";
import { entityFacing, bindEntitySlot, clearWorldPropSpawnPose, ENTITY_KIND_WORLD_PROP, ENTITY_FLAG_KINETIC } from "../Libraries/Entity/entitySlots.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";

describe("entityFacing SoA", () => {
    it("pre-eid facing lives on spawn bag; post-eid uses entityFacing column", () => {
        const prop = new WorldProp(10, 20, "crate", Math.PI / 4);
        assert.equal(prop._physId, undefined);
        assert.equal(prop.facing, Math.PI / 4);
        assert.equal(prop._spawnFacing, Math.PI / 4);
        assert.equal(entityFacingFn(prop), Math.PI / 4);

        assignPhysIdWithPose(prop, 7);
        assert.ok(Math.abs(entityFacing[7] - Math.PI / 4) < 1e-6);
        assert.ok(Math.abs(prop.facing - Math.PI / 4) < 1e-6);
        assert.equal(prop._spawnFacing, undefined);

        prop.facing = 1.25;
        assert.ok(Math.abs(entityFacing[7] - 1.25) < 1e-6);
        assert.ok(Math.abs(entityFacingFn(prop) - 1.25) < 1e-6);
    });

    it("bindEntitySlot copies spawn facing before clear", () => {
        const prop = new WorldProp(0, 0, "crate", 0.75);
        const x = prop.x;
        const y = prop.y;
        prop._physId = 3;
        bindEntitySlot(3, ENTITY_KIND_WORLD_PROP, prop, prop.id | 0, x, y, 8, ENTITY_FLAG_KINETIC);
        clearWorldPropSpawnPose(prop);
        assert.ok(Math.abs(entityFacing[3] - 0.75) < 1e-6);
        assert.ok(Math.abs(prop.facing - 0.75) < 1e-6);
    });
});
