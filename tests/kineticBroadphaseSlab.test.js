import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { getBroadphaseBounds, snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { kineticBroadphaseSlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab, writeKineticBroadphaseSlabSlot } from "../Libraries/Spatial/collision/kineticBroadphaseSlab.js";
import { pairBroadphaseBoundsOverlap } from "../Libraries/Spatial/collision/Broadphase.js";

function mockCircleBody(x, y, radius) {
    return {
        id: 1,
        x,
        y,
        radius,
        strategy: { isKinetic: true },
        getShape() {
            return new CircleShape(radius);
        },
    };
}

describe("kinetic broadphase slab", () => {
    it("slab slot matches computed broadphase bounds", () => {
        const body = mockCircleBody(12, -4, 9);
        body._physId = 3;
        writeKineticBroadphaseSlabSlot(body._physId, getBroadphaseBounds(body));
        assert.equal(kineticBroadphaseSlab.cx[3], 12);
        assert.equal(kineticBroadphaseSlab.cy[3], -4);
        assert.equal(kineticBroadphaseSlab.r[3], 9);
    });

    it("slab overlap matches object overlap after snapshot", () => {
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotActiveBroadphaseBounds([a, b]);
        assert.equal(pairCircleCircleOverlapSlab(0, 1), pairBroadphaseBoundsOverlap(a.broadphaseBounds, b.broadphaseBounds));
        assert.equal(pairBroadphaseOverlapSlab(0, 1), pairBroadphaseBoundsOverlap(a.broadphaseBounds, b.broadphaseBounds));
    });
});
