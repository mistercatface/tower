import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { addAngleConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { gatherKineticConstraintSlab, resolveGatheredKineticConstraintSlab } from "../Libraries/Motion/kineticConstraintSolver.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

let nextId = 1;
function mockCircleBody(x, y, radius) {
    return {
        id: nextId++,
        x,
        y,
        radius,
        vx: 0,
        vy: 0,
        angularVelocity: 0,
        facing: 0,
        isSleeping: false,
        strategy: { isKinetic: true },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
    };
}

describe("angle constraint solver", () => {
    it("locks the angle of two connected bodies and propagates torque", () => {
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(30, 0, 10);
        
        // Let's set initial angles and reference angle
        bodyA.facing = 0.5;
        bodyB.facing = 0.0;
        const referenceAngle = -0.5;
        
        const tick = createKineticTestTick([bodyA, bodyB]);
        addAngleConstraint(tick.world.kinetic, { bodyA, bodyB, referenceAngle });
        
        // Verify initially satisfied
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        
        assert.ok(Math.abs(bodyB.facing - (bodyA.facing + referenceAngle)) < 1e-4);
        
        // Now, let's rotate bodyA. We set an angular velocity on bodyA in the dynamic slab
        bodyA.facing = 0.5;
        bodyB.facing = 0.0;
        bodyA.angularVelocity = 2.0;
        
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        
        const wA = kineticDynamicSlab.w[bodyA._physId];
        const wB = kineticDynamicSlab.w[bodyB._physId];
        
        assert.ok(Math.abs(wA - 1.0) < 0.1, `expected wA ~1.0, got ${wA}`);
        assert.ok(Math.abs(wB - 1.0) < 0.1, `expected wB ~1.0, got ${wB}`);
    });
    
    it("corrects angle offset during position projection pass", () => {
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(30, 0, 10);
        
        bodyA.facing = 1.0;
        bodyB.facing = 0.0;
        const referenceAngle = 0.0;
        
        const tick = createKineticTestTick([bodyA, bodyB]);
        addAngleConstraint(tick.world.kinetic, { bodyA, bodyB, referenceAngle });
        
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        
        assert.ok(Math.abs(bodyA.facing - 0.5) < 1e-4, `expected bodyA.facing ~0.5, got ${bodyA.facing}`);
        assert.ok(Math.abs(bodyB.facing - 0.5) < 1e-4, `expected bodyB.facing ~0.5, got ${bodyB.facing}`);
    });
});
