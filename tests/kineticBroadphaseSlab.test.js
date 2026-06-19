import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { getBroadphaseBounds, snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { kineticBroadphaseSlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab, writeKineticBroadphaseSlabSlot } from "../Libraries/Spatial/collision/kineticBroadphaseSlab.js";
import { pairBroadphaseBoundsOverlap } from "../Libraries/Spatial/collision/Broadphase.js";
import { snapshotKinematicSlab } from "../Libraries/Spatial/collision/kineticKinematicSlab.js";
import { circleCircleContactSlab } from "../Libraries/Spatial/collision/kineticCircleContactSolver.js";
import { circleCircleContact } from "../Libraries/Spatial/collision/SatCollision.js";

function mockCircleBody(x, y, radius) {
    return {
        id: 1,
        x,
        y,
        radius,
        mass: radius,
        strategy: { isKinetic: true },
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
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

    it("slab circle contact matches SAT circle contact", () => {
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotActiveBroadphaseBounds([a, b]);
        snapshotKinematicSlab([a, b]);
        const slab = circleCircleContactSlab(0, 1);
        const sat = circleCircleContact(a, a.getShape(), b, b.getShape());
        assert.ok(slab);
        assert.ok(sat);
        assert.ok(Math.abs(slab.overlap - sat.overlap) < 1e-5);
        assert.ok(Math.abs(slab.nx - sat.nx) < 1e-5);
        assert.ok(Math.abs(slab.ny - sat.ny) < 1e-5);
    });
});
