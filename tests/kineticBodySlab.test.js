import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { mockKineticCircle, assignPhysIdWithPose, snapshotKineticBodySlab } from "./harness/kineticTickHarness.js";
import { bodiesMatchKineticSlab } from "./harness/kineticSlabHarness.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { checkPairAtSlabPose } from "./harness/kineticContactHarness.js";

describe("kinetic body slab", () => {
    it("broadphase slot uses body x/y as circle center", () => {
        const body = mockKineticCircle(12, -4, 9);
        assignPhysIdWithPose(body, 3);
        snapshotKineticBodySlab([body._physId], 1);
        assert.equal(kineticDynamicSlab.x[3], 12);
        assert.equal(kineticDynamicSlab.y[3], -4);
        assert.equal(kineticDynamicSlab.r[3], 9);
    });

    it("slab overlap detects overlapping circles after snapshot", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        assignPhysIdWithPose(a, 0);
        assignPhysIdWithPose(b, 1);
        snapshotKineticBodySlab([a._physId, b._physId], 2);
        assert.ok(checkPairAtSlabPose(a, b));
    });

    it("slab overlap detects circle against crate OBB", () => {
        const ball = mockKineticCircle(0, 0, 10);
        const crate = new WorldProp(14, 0, "box", 0);
        assignPhysIdWithPose(ball, 0);
        assignPhysIdWithPose(crate, 1);
        snapshotKineticBodySlab([ball._physId, crate._physId], 2);
        assert.ok(checkPairAtSlabPose(ball, crate));
    });

    it("snapshotKineticBodySlab fills kinematic and broadphase columns", () => {
        const a = mockKineticCircle(1, 2, 5, 3, -1);
        assignPhysIdWithPose(a, 4);
        snapshotKineticBodySlab([a._physId], 1);
        assert.equal(kineticDynamicSlab.vx[4], 3);
        assert.equal(kineticDynamicSlab.vy[4], -1);
        assert.equal(kineticDynamicSlab.r[4], 5);
    });

    it("activeBodiesMatchKineticSlab detects pose drift after unsynced move", () => {
        const a = mockKineticCircle(0, 0, 10);
        a.isKineticDebris = true;
        assignPhysIdWithPose(a, 0);
        snapshotKineticBodySlab([a._physId], 1);
        assert.ok(bodiesMatchKineticSlab([a]));
        a.x = 5;
        assert.equal(bodiesMatchKineticSlab([a]), false);
        kineticDynamicSlab.x[0] = 5;
        assert.ok(bodiesMatchKineticSlab([a]));
    });
});
