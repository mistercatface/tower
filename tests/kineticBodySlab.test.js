import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getBroadphaseBounds, snapshotKineticBodySlab } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { mockKineticCircle } from "./harness/kineticTickHarness.js";
import { kineticDynamicSlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab, writeBroadphaseFromBounds, writeStaticKineticSlabSlot, writeActiveKineticBodySlabPose, activeBodiesMatchKineticSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { pairBroadphaseBoundsOverlap } from "../Libraries/Spatial/collision/Broadphase.js";
import { circleCircleContactSlab } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { circleCircleContact, SAT_RESULT } from "../Libraries/Spatial/collision/SatCollision.js";

describe("kinetic body slab", () => {
    it("broadphase slot uses body x/y as circle center", () => {
        const body = mockKineticCircle(12, -4, 9);
        body._physId = 3;
        writeStaticKineticSlabSlot(body);
        writeActiveKineticBodySlabPose(body);
        writeBroadphaseFromBounds(body._physId, getBroadphaseBounds(body));
        assert.equal(kineticDynamicSlab.x[3], 12);
        assert.equal(kineticDynamicSlab.y[3], -4);
        assert.equal(kineticDynamicSlab.r[3], 9);
    });

    it("slab overlap matches object overlap after snapshot", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotKineticBodySlab([a, b]);
        assert.equal(pairCircleCircleOverlapSlab(0, 1), pairBroadphaseBoundsOverlap(a.broadphaseBounds, b.broadphaseBounds));
        assert.equal(pairBroadphaseOverlapSlab(0, 1), pairBroadphaseBoundsOverlap(a.broadphaseBounds, b.broadphaseBounds));
    });

    it("snapshotKineticBodySlab fills kinematic and broadphase columns", () => {
        const a = mockKineticCircle(1, 2, 5,);
        a._physId = 4;
        a.vx = 3;
        a.vy = -1;
        snapshotKineticBodySlab([a]);
        assert.equal(kineticDynamicSlab.vx[4], 3);
        assert.equal(kineticDynamicSlab.vy[4], -1);
        assert.equal(kineticDynamicSlab.r[4], 5);
    });

    it("slab circle contact matches SAT circle contact", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotKineticBodySlab([a, b]);
        const slabCollided = circleCircleContactSlab(0, 1);
        assert.ok(slabCollided);
        const slabRes = new Float32Array(SAT_RESULT);
        const satCollided = circleCircleContact(a.x, a.y, a.shape, b.x, b.y, b.shape);
        assert.ok(satCollided);
        assert.ok(Math.abs(slabRes[0] - SAT_RESULT[0]) < 1e-5);
        assert.ok(Math.abs(slabRes[1] - SAT_RESULT[1]) < 1e-5);
        assert.ok(Math.abs(slabRes[2] - SAT_RESULT[2]) < 1e-5);
    });

    it("activeBodiesMatchKineticSlab detects pose drift after unsynced move", () => {
        const a = mockKineticCircle(0, 0, 10);
        a._physId = 0;
        snapshotKineticBodySlab([a]);
        assert.ok(activeBodiesMatchKineticSlab([a]));
        a.x = 5;
        assert.equal(activeBodiesMatchKineticSlab([a]), false);
        snapshotKineticBodySlab([a]);
        assert.ok(activeBodiesMatchKineticSlab([a]));
    });
});
