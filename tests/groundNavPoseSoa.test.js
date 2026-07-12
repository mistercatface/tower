import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultSandboxBehaviors } from "../Libraries/Sandbox/sandbox.js";
import { ROLL_DRIVE_THRUST, SANDBOX_BEHAVIOR_GROUND_DIRECT, SANDBOX_BEHAVIOR_GROUND_FLOW } from "../Core/engineEnums.js";
import { createSandboxDragTestState, registerGrabDragTestProp } from "./harness/sandboxDragHarness.js";
import { mockRollingProp } from "./harness/kineticTickHarness.js";
import { kineticDynamicSlab, entityX, entityY } from "../Core/engineMemory.js";

describe("ground nav pose SoA", () => {
    it("direct tickSteering steers from entityX/entityY not stale object pose", () => {
        const state = createSandboxDragTestState();
        const behaviors = createDefaultSandboxBehaviors(state);
        const direct = behaviors.find((b) => b.id === SANDBOX_BEHAVIOR_GROUND_DIRECT);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        const eid = prop._physId;
        entityX[eid] = 0;
        entityY[eid] = 0;
        Object.defineProperties(prop, {
            x: { value: 999, writable: true, configurable: true, enumerable: true },
            y: { value: 0, writable: true, configurable: true, enumerable: true },
        });
        direct.setMoveTarget(eid, 120, 0);
        direct.tick(eid, 16);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_THRUST);
        assert.ok(kineticDynamicSlab.rollDriveDirX[eid] > 0.9);
        assert.equal(prop.x, 999);
        assert.equal(entityX[eid], 0);
    });

    it("flow ensureRollTargetWindow uses entityX/entityY not stale object pose", () => {
        const state = createSandboxDragTestState();
        const seen = [];
        state.flowFieldGrid = {
            ensureRollTargetWindow(x, y) {
                seen.push(x, y);
            },
            refresh() {},
            getReadyFlowField() {
                return null;
            },
        };
        const behaviors = createDefaultSandboxBehaviors(state);
        const flow = behaviors.find((b) => b.id === SANDBOX_BEHAVIOR_GROUND_FLOW);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 2, x: 0, y: 0, type: "ball" }));
        const eid = prop._physId;
        entityX[eid] = 16;
        entityY[eid] = 32;
        Object.defineProperties(prop, {
            x: { value: 900, writable: true, configurable: true, enumerable: true },
            y: { value: 900, writable: true, configurable: true, enumerable: true },
        });
        flow.setMoveTarget(eid, 200, 32);
        assert.ok(seen.length >= 2);
        assert.equal(seen[seen.length - 2], 16);
        assert.equal(seen[seen.length - 1], 32);
        assert.equal(prop.x, 900);
        assert.equal(entityX[eid], 16);
    });
});
