import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGroundRollDrive } from "../Libraries/Physics/physics.js";
import { ROLL_DRIVE_NONE, ROLL_DRIVE_THRUST } from "../Core/engineEnums.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { findClosestPolygonBoundaryGrabPointInto, findCircleRimGrabPointInto, boxLocalFootprint } from "../Libraries/Math/math.js";
import { createGrabDragBehavior, getDragLaunchConfig, GRAB_DRAG_BEHAVIOR_ID } from "../Libraries/Sandbox/dragBehaviors.js";
import { createDefaultSandboxBehaviors, spawnLinkedBallChain } from "../Libraries/Sandbox/sandbox.js";
import { createGrabDragTestState, registerGrabDragTestProp } from "./harness/sandboxDragHarness.js";
import { mockRollingProp } from "./harness/kineticTickHarness.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";

describe("grabDrag behavior", () => {
    it("getDragLaunchConfig uses dragLaunch for grab", () => {
        assert.equal(getDragLaunchConfig({ sandbox: { dragLaunch: { minPower: 42 } } }).minPower, 42);
    });

    it("onPointerDown returns true for kinetic props and false otherwise", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const kinetic = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 32, y: 32, type: "ball" }));
        const staticProp = registerGrabDragTestProp(state, { id: 2, x: 48, y: 48, strategy: { isKinetic: false }, isDead: false });
        assert.equal(behavior.onPointerDown(kinetic, { x: 32, y: 32 }), true);
        assert.equal(behavior.onPointerDown(staticProp, { x: 48, y: 48 }), false);
    });

    it("tickWorld steers toward pull target instead of teleporting", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        assert.ok(behavior.onPointerDown(prop, { x: 0, y: 0 }));
        behavior.onPointerMove(prop, { x: 120, y: 0 });
        behavior.tickWorld(16);
        assert.equal(prop._rollDriveKind, ROLL_DRIVE_THRUST);
        assert.ok(prop._rollDriveDirX > 0.9);
        assert.ok(Math.abs(prop.x) < 20);
    });

    it("sustains thrust while cursor stays beyond a wall without snapping through", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        behavior.onPointerDown(prop, { x: 0, y: 0 });
        behavior.onPointerMove(prop, { x: 200, y: 0 });
        for (let i = 0; i < 5; i++) behavior.tickWorld(16);
        assert.equal(prop._rollDriveKind, ROLL_DRIVE_THRUST);
        assert.ok(prop.x < 100);
    });

    it("onPointerUp clears roll drive but keeps momentum", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball", vx: 12, vy: 3 }));
        behavior.onPointerDown(prop, { x: 0, y: 0 });
        behavior.onPointerMove(prop, { x: 80, y: 0 });
        behavior.tickWorld(16);
        assert.equal(prop._rollDriveKind, ROLL_DRIVE_THRUST);
        behavior.onPointerUp(prop);
        assert.equal(prop._rollDriveKind, ROLL_DRIVE_NONE);
        applyGroundRollDrive(prop, 0.016, state);
        assert.ok(Math.hypot(prop.vx, prop.vy) > 0);
    });

    it("pulls only the grabbed chain segment while neighbors follow via constraints", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid, 10, 10), {
            segmentCount: 3,
            spacing: 16,
            ballType: "ball",
            growDirX: -1,
            growDirY: 0,
            linkSlack: 1,
            faction: "alpha",
        });
        const middle = chain.members[1];
        const headX = chain.head.x;
        behavior.onPointerDown(middle, { x: middle.x, y: middle.y });
        behavior.onPointerMove(middle, { x: middle.x + 80, y: middle.y });
        behavior.tickWorld(16);
        assert.equal(middle._rollDriveKind, ROLL_DRIVE_THRUST);
        assert.ok(chain.head._rollDriveKind == null || chain.head._rollDriveKind === ROLL_DRIVE_NONE);
        assert.notEqual(chain.head.x, middle.x);
        assert.ok(Math.abs(chain.head.x - headX) < 40);
    });

    it("is registered in createDefaultSandboxBehaviors", () => {
        const state = createGrabDragTestState();
        const ids = createDefaultSandboxBehaviors(state).map((behavior) => behavior.id);
        assert.ok(ids.includes(GRAB_DRAG_BEHAVIOR_ID));
    });

    it("findCircleRimGrabPointInto places grab on rim toward cursor", () => {
        const out = new Float32Array(4);
        findCircleRimGrabPointInto(out, 0, 0, 0, 0, 8, 12, 0);
        assert.ok(Math.abs(out[0] - 8) < 0.01);
        assert.ok(Math.abs(out[1]) < 0.01);
        assert.ok(Math.abs(out[2] - 8) < 0.01);
        findCircleRimGrabPointInto(out, 0, 0, 0, 0, 8, 0, 0);
        assert.ok(Math.abs(out[0] - 8) < 0.01);
    });

    it("findClosestPolygonBoundaryGrabPointInto snaps to corner or edge", () => {
        const out = new Float32Array(4);
        const box = boxLocalFootprint(12, 8);
        findClosestPolygonBoundaryGrabPointInto(out, 0, box, 0, 0, 0, 12, 8);
        assert.ok(Math.abs(out[2] - 12) < 0.01);
        assert.ok(Math.abs(out[3] - 8) < 0.01);
        findClosestPolygonBoundaryGrabPointInto(out, 0, box, 0, 0, 0, 0, 8);
        assert.ok(Math.abs(out[2]) < 0.01);
        assert.ok(Math.abs(out[3] - 8) < 0.01);
    });

    it("polygon grab uses off-center anchor and applies grab torque", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerGrabDragTestProp(state, new WorldProp(0, 0, "tri_wedge", 0));
        prop.angularVelocity = 0;
        behavior.onPointerDown(prop, { x: -9, y: -5 });
        behavior.onPointerMove(prop, { x: -9, y: 80 });
        behavior.tickWorld(16);
        assert.equal(prop._rollDriveKind, ROLL_DRIVE_THRUST);
        assert.ok(prop._rollDriveDirY > 0.5);
        assert.notEqual(prop.angularVelocity, 0);
    });

    it("rolling sphere rim anchor tracks cursor not rollQuat", () => {
        const prop = mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" });
        prop.rollQw = 0.9239;
        prop.rollQx = 0;
        prop.rollQy = 0.3827;
        prop.rollQz = 0;
        const rim = new Float32Array(4);
        findCircleRimGrabPointInto(rim, 0, 0, 0, 0, 8, 10, 0);
        assert.ok(Math.abs(rim[0] - 8) < 0.01);
        assert.ok(Math.abs(rim[1]) < 0.01);
    });

    it("sphere rim grab steers from rolled contact", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball", angularVelocity: 0 }));
        behavior.onPointerDown(prop, { x: 10, y: 0 });
        behavior.onPointerMove(prop, { x: 10, y: 100 });
        behavior.tickWorld(16);
        assert.equal(prop._rollDriveKind, ROLL_DRIVE_THRUST);
        assert.ok(prop._rollDriveDirY > 0.5);
    });

    it("reference grab inertia matches spin for light and heavy polygons", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const light = registerGrabDragTestProp(state, new WorldProp(0, 0, "tri_wedge", 0));
        const heavy = registerGrabDragTestProp(state, new WorldProp(100, 0, "tri_wedge", 0));
        heavy.mass = light.mass * 100;
        light.angularVelocity = 0;
        heavy.angularVelocity = 0;
        behavior.onPointerDown(light, { x: -9, y: -5 });
        behavior.onPointerMove(light, { x: -9, y: 80 });
        behavior.tickWorld(16);
        const lightSpin = light.angularVelocity;
        behavior.onPointerDown(heavy, { x: 91, y: -5 });
        behavior.onPointerMove(heavy, { x: 91, y: 80 });
        behavior.tickWorld(16);
        assert.ok(Math.abs(lightSpin) > 0);
        assert.ok(Math.abs(heavy.angularVelocity - lightSpin) < 1e-6);
    });
});
