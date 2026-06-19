import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { getBroadphaseBounds, snapshotActiveBroadphaseBounds, snapshotKineticBodySlab } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { kineticBodySlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab, writeBroadphaseFromBounds, writeKinematicBodySlabSlot } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { pairBroadphaseBoundsOverlap } from "../Libraries/Spatial/collision/Broadphase.js";
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

describe("kinetic body slab", () => {
    it("broadphase slot uses body x/y as circle center", () => {
        const body = mockCircleBody(12, -4, 9);
        body._physId = 3;
        writeKinematicBodySlabSlot(body);
        writeBroadphaseFromBounds(body._physId, getBroadphaseBounds(body));
        assert.equal(kineticBodySlab.x[3], 12);
        assert.equal(kineticBodySlab.y[3], -4);
        assert.equal(kineticBodySlab.r[3], 9);
    });

    it("slab overlap matches object overlap after snapshot", () => {
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotKineticBodySlab([a, b]);
        assert.equal(pairCircleCircleOverlapSlab(0, 1), pairBroadphaseBoundsOverlap(a.broadphaseBounds, b.broadphaseBounds));
        assert.equal(pairBroadphaseOverlapSlab(0, 1), pairBroadphaseBoundsOverlap(a.broadphaseBounds, b.broadphaseBounds));
    });

    it("snapshotActiveBroadphaseBounds fills kinematic and broadphase columns", () => {
        const a = mockCircleBody(1, 2, 5,);
        a._physId = 4;
        a.vx = 3;
        a.vy = -1;
        snapshotActiveBroadphaseBounds([a]);
        assert.equal(kineticBodySlab.vx[4], 3);
        assert.equal(kineticBodySlab.vy[4], -1);
        assert.equal(kineticBodySlab.r[4], 5);
    });

    it("slab circle contact matches SAT circle contact", () => {
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotKineticBodySlab([a, b]);
        const slab = circleCircleContactSlab(0, 1);
        const sat = circleCircleContact(a, a.getShape(), b, b.getShape());
        assert.ok(slab);
        assert.ok(sat);
        assert.ok(Math.abs(slab.overlap - sat.overlap) < 1e-5);
        assert.ok(Math.abs(slab.nx - sat.nx) < 1e-5);
        assert.ok(Math.abs(slab.ny - sat.ny) < 1e-5);
    });
});
