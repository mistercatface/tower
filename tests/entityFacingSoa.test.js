import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";

import { ENTITY_KIND_WORLD_PROP, ENTITY_FLAG_KINETIC } from "../Core/engineEnums.js";
import { bindEntitySlot, clearWorldPropSpawnPose } from "../Core/entitySlots.js";
import { entityFacing } from "../Core/engineMemory.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";

describe("entityFacing SoA", () => {
    it("facing uses entityFacing column from birth", () => {
        const prop = new WorldProp(10, 20, "box", Math.PI / 4);
        assert.equal(typeof prop._physId, "number");
        const birthEid = prop._physId;
        assert.ok(Math.abs(entityFacing[birthEid] - Math.PI / 4) < 1e-6);
        assert.ok(Math.abs(prop.facing - Math.PI / 4) < 1e-6);

        // Reassigning physId in tests should release birthEid and delegate to the new one
        assignPhysIdWithPose(prop, 7);
        assert.ok(Math.abs(entityFacing[7] - Math.PI / 4) < 1e-6);
        assert.ok(Math.abs(prop.facing - Math.PI / 4) < 1e-6);

        prop.facing = 1.25;
        assert.ok(Math.abs(entityFacing[7] - 1.25) < 1e-6);
        assert.ok(Math.abs(prop.facing - 1.25) < 1e-6);
    });

    it("bindEntitySlot does not overwrite current values if already set", () => {
        const prop = new WorldProp(0, 0, "box", 0.75);
        const x = prop.x;
        const y = prop.y;
        const birthEid = prop._physId;
        bindEntitySlot(birthEid, ENTITY_KIND_WORLD_PROP, prop, prop.id | 0, x, y, 8, ENTITY_FLAG_KINETIC);
        assert.ok(Math.abs(entityFacing[birthEid] - 0.75) < 1e-6);
        assert.ok(Math.abs(prop.facing - 0.75) < 1e-6);
    });
});
