import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGroundRollDrive, CircleShape } from "../Libraries/Physics/physics.js";
import { ROLL_DRIVE_NONE, ROLL_DRIVE_THRUST, SANDBOX_BEHAVIOR_GRAB_DRAG } from "../Core/engineEnums.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { findClosestPolygonBoundaryGrabPointInto, findCircleRimGrabPointInto, boxLocalFootprint } from "../Libraries/Math/math.js";
import { createGrabDragBehavior, resolveDragLaunchConfigFromSize } from "../Libraries/Sandbox/dragBehaviors.js";
import { createDefaultSandboxBehaviors } from "../Libraries/Sandbox/sandbox.js";
import { spawnLinkedBallChain } from "./harness/spawnAgentChainHarness.js";
import { createGrabDragTestState, registerGrabDragTestProp } from "./harness/sandboxDragHarness.js";
import { mockRollingProp } from "./harness/kineticTickHarness.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { ENGINE_F32, G_WX, G_WY, G_LX, G_LY } from "../Core/engineMemory.js";

describe("grabDrag behavior", () => {
    it("resolveDragLaunchConfigFromSize scales maxPower with prop radius", () => {
        const smallPower = resolveDragLaunchConfigFromSize(4).maxPower;
        const largePower = resolveDragLaunchConfigFromSize(14).maxPower;
        assert.ok(smallPower > 400);
        assert.ok(smallPower < 600);
        assert.ok(largePower > smallPower);
        assert.equal(largePower, 700);
        const state = createGrabDragTestState();
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball", radius: 4, shape: new CircleShape(4) }));
        assert.equal(resolveDragLaunchConfigFromSize(prop.radius).maxPower, smallPower);
    });

    it("onPointerDown returns true for kinetic props and false otherwise", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const kinetic = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 32, y: 32, type: "ball" }));
        const staticProp = registerGrabDragTestProp(state, { id: 2, x: 48, y: 48, radius: 8, shape: new CircleShape(8), strategy: { isKinetic: false }, isDead: false });
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
        assert.ok(ids.includes(SANDBOX_BEHAVIOR_GRAB_DRAG));
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

    it("compound polygon grab uses drawOutline not first collision part", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerGrabDragTestProp(state, new WorldProp(0, 0, "cross_pinwheel", 0));
        assert.ok(prop.drawOutline?.length >= 6);
        assert.ok(prop.collisionParts?.length > 1);
        const tipX = 16;
        const tipY = 0;
        const partOnly = new Float32Array(4);
        const outline = new Float32Array(4);
        findClosestPolygonBoundaryGrabPointInto(partOnly, 0, prop.shape.vertices, 0, 0, 0, tipX, tipY);
        findClosestPolygonBoundaryGrabPointInto(outline, 0, prop.drawOutline, 0, 0, 0, tipX, tipY);
        const distPart = Math.hypot(partOnly[0] - tipX, partOnly[1] - tipY);
        const distOutline = Math.hypot(outline[0] - tipX, outline[1] - tipY);
        assert.ok(distOutline < 0.5, "outline snap should land on right arm tip");
        assert.ok(distPart > distOutline + 2, "first collision part alone should miss the outer tip");
        assert.ok(behavior.onPointerDown(prop, { x: tipX, y: tipY }));
        assert.ok(Math.abs(ENGINE_F32[G_WX] - tipX) < 1);
        assert.ok(Math.abs(ENGINE_F32[G_WY] - tipY) < 1);
        assert.ok(Math.abs(ENGINE_F32[G_LX] - tipX) < 1);
        assert.ok(Math.abs(ENGINE_F32[G_LY] - tipY) < 1);
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
