import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGroundRollDrive, CircleShape } from "../Libraries/Physics/physics.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { findClosestPolygonBoundaryGrabPointInto, findCircleRimGrabPointInto, boxLocalFootprint } from "../Libraries/Math/math.js";
import { createDefaultSandboxBehaviors } from "../Libraries/Sandbox/sandbox.js";
import { ROLL_DRIVE_NONE, ROLL_DRIVE_THRUST, SANDBOX_BEHAVIOR_GRAB_DRAG, SANDBOX_BEHAVIOR_DRAG_LAUNCH } from "../Core/engineEnums.js";
import { spawnLinkedBallChain } from "./harness/spawnAgentChainHarness.js";
import { createGrabDragTestState, registerGrabDragTestProp } from "./harness/sandboxDragHarness.js";
import { mockRollingProp } from "./harness/kineticTickHarness.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { ENGINE_F32, G_WX, G_WY, G_LX, G_LY, kineticDynamicSlab, entityX, entityY, entityW, entityR } from "../Core/engineMemory.js";
import { BeltPacked } from "../Libraries/Spatial/belts.js";
import { clearOverlayCommands, overlayCommandSlab, OVERLAY_STYLE_DRAG_ANCHOR } from "../Libraries/Render/render.js";

describe("grabDrag behavior", () => {

    it("onPointerDown returns true for kinetic props and false otherwise", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const kinetic = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 32, y: 32, type: "ball" }));
        const staticProp = registerGrabDragTestProp(state, { id: 2, x: 48, y: 48, radius: 8, shape: new CircleShape(8), strategy: { isKinetic: false }, isDead: false });
        assert.equal(behavior.onPointerDown(kinetic._physId, { x: 32, y: 32 }), true);
        assert.equal(behavior.onPointerDown(staticProp._physId, { x: 48, y: 48 }), false);
    });

    it("tickWorld steers toward pull target instead of teleporting", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        assert.ok(behavior.onPointerDown(prop._physId, { x: 0, y: 0 }));
        behavior.onPointerMove(prop._physId, { x: 120, y: 0 });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[prop._physId], ROLL_DRIVE_THRUST);
        assert.ok(kineticDynamicSlab.rollDriveDirX[prop._physId] > 0.9);
        assert.ok(Math.abs(prop.x) < 20);
    });

    it("tickPull steers from entityX/entityY not stale object pose", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        const eid = prop._physId;
        assert.ok(behavior.onPointerDown(prop._physId, { x: 0, y: 0 }));
        entityX[eid] = 0;
        entityY[eid] = 0;
        Object.defineProperties(prop, {
            x: { value: 999, writable: true, configurable: true, enumerable: true },
            y: { value: 999, writable: true, configurable: true, enumerable: true },
        });
        behavior.onPointerMove(prop._physId, { x: 120, y: 0 });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_THRUST);
        assert.ok(kineticDynamicSlab.rollDriveDirX[eid] > 0.9);
        assert.equal(prop.x, 999);
        assert.equal(entityX[eid], 0);
    });

    it("onPointerDown grab anchor uses entityX/entityY not stale object pose", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        const eid = prop._physId;
        entityX[eid] = 0;
        entityY[eid] = 0;
        Object.defineProperties(prop, {
            x: { value: 200, writable: true, configurable: true, enumerable: true },
            y: { value: 0, writable: true, configurable: true, enumerable: true },
        });
        assert.ok(behavior.onPointerDown(prop._physId, { x: 8, y: 0 }));
        behavior.onPointerMove(prop._physId, { x: -50, y: 0 });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_THRUST);
        assert.ok(kineticDynamicSlab.rollDriveDirX[eid] < -0.9);
        assert.equal(prop.x, 200);
        assert.equal(entityX[eid], 0);
    });

    it("sphere rim grab uses entityR not stale object radius", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball", radius: 8, shape: new CircleShape(8) }));
        const eid = prop._physId;
        entityX[eid] = 0;
        entityY[eid] = 0;
        entityR[eid] = 8;
        Object.defineProperty(prop, "radius", { value: 100, writable: true, configurable: true, enumerable: true });
        assert.ok(behavior.onPointerDown(prop._physId, { x: 8, y: 0 }));
        behavior.onPointerMove(prop._physId, { x: -50, y: 0 });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_THRUST);
        assert.ok(kineticDynamicSlab.rollDriveDirX[eid] < -0.9);
        assert.equal(prop.radius, 100);
        assert.equal(entityR[eid], 8);
    });

    it("drag launch aim anchor uses entityX/entityY not stale object pose", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_DRAG_LAUNCH);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        const eid = prop._physId;
        entityX[eid] = 40;
        entityY[eid] = 10;
        Object.defineProperties(prop, {
            x: { value: 999, writable: true, configurable: true, enumerable: true },
            y: { value: 999, writable: true, configurable: true, enumerable: true },
        });
        assert.ok(behavior.onPointerDown(prop._physId, { x: 40, y: 10 }));
        behavior.onPointerMove(prop._physId, { x: 10, y: 10 });
        clearOverlayCommands(overlayCommandSlab);
        behavior.appendOverlayCommands(overlayCommandSlab, prop._physId);
        const stride = 12;
        let found = false;
        for (let i = 0; i < overlayCommandSlab.count; i++) {
            if (overlayCommandSlab.styleId[i] !== OVERLAY_STYLE_DRAG_ANCHOR) continue;
            const b = i * stride;
            assert.equal(overlayCommandSlab.f[b], 40);
            assert.equal(overlayCommandSlab.f[b + 1], 10);
            found = true;
        }
        assert.ok(found);
        assert.equal(prop.x, 999);
    });

    it("tickWorld belt cancel uses entityX/entityY not stale object pose", () => {
        const state = createGrabDragTestState();
        const grid = state.obstacleGrid;
        const beltIdx = worldIdxAtCell(grid, 5, 5);
        const offIdx = worldIdxAtCell(grid, 8, 8);
        grid.writeFloorCell(beltIdx, BeltPacked.defaultForSpawn("floor_belt"));
        const beltX = grid.gridCenterXByIdx(beltIdx);
        const beltY = grid.gridCenterYByIdx(beltIdx);
        const offX = grid.gridCenterXByIdx(offIdx);
        const offY = grid.gridCenterYByIdx(offIdx);
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: offX, y: offY, type: "ball" }));
        const eid = prop._physId;
        assert.ok(behavior.onPointerDown(prop._physId, { x: offX, y: offY }));
        behavior.onPointerMove(prop._physId, { x: offX + 80, y: offY });
        entityX[eid] = offX;
        entityY[eid] = offY;
        Object.defineProperties(prop, {
            x: { value: beltX, writable: true, configurable: true, enumerable: true },
            y: { value: beltY, writable: true, configurable: true, enumerable: true },
        });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_THRUST);
        entityX[eid] = beltX;
        entityY[eid] = beltY;
        Object.defineProperties(prop, {
            x: { value: offX, writable: true, configurable: true, enumerable: true },
            y: { value: offY, writable: true, configurable: true, enumerable: true },
        });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_NONE);
    });

    it("sustains thrust while cursor stays beyond a wall without snapping through", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        behavior.onPointerDown(prop._physId, { x: 0, y: 0 });
        behavior.onPointerMove(prop._physId, { x: 200, y: 0 });
        for (let i = 0; i < 5; i++) behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[prop._physId], ROLL_DRIVE_THRUST);
        assert.ok(prop.x < 100);
    });

    it("onPointerUp clears roll drive but keeps momentum", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball", vx: 12, vy: 3 }));
        behavior.onPointerDown(prop._physId, { x: 0, y: 0 });
        behavior.onPointerMove(prop._physId, { x: 80, y: 0 });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[prop._physId], ROLL_DRIVE_THRUST);
        behavior.onPointerUp(prop._physId);
        assert.equal(kineticDynamicSlab.rollDriveKind[prop._physId], ROLL_DRIVE_NONE);
        applyGroundRollDrive(prop._physId, 0.016);
        assert.ok(Math.hypot(prop.vx, prop.vy) > 0);
    });

    it("pulls only the grabbed chain segment while neighbors follow via constraints", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
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
        behavior.onPointerDown(middle._physId, { x: middle.x, y: middle.y });
        behavior.onPointerMove(middle._physId, { x: middle.x + 80, y: middle.y });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[middle._physId], ROLL_DRIVE_THRUST);
        assert.equal(kineticDynamicSlab.rollDriveKind[chain.head._physId], ROLL_DRIVE_NONE);
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

    it("compound polygon grab uses stamped collision parts", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, new WorldProp(0, 0, "cross_pinwheel", 0));
        assert.ok(prop.collisionParts?.length > 1);
        const tipX = 16;
        const tipY = 0;
        assert.ok(behavior.onPointerDown(prop._physId, { x: tipX, y: tipY }));
        const dx = ENGINE_F32[G_WX] - tipX;
        const dy = ENGINE_F32[G_WY] - tipY;
        assert.ok(Math.hypot(dx, dy) <= 8, `grab should land on a stamped part edge near tip, got ${ENGINE_F32[G_WX]},${ENGINE_F32[G_WY]}`);
        assert.ok(Math.hypot(ENGINE_F32[G_LX], ENGINE_F32[G_LY]) > 1, "grab local offset should be off-center");
    });

    it("polygon grab uses off-center anchor and applies grab torque", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, new WorldProp(0, 0, "tri_wedge", 0));
        const eid = prop._physId;
        entityW[eid] = 0;
        behavior.onPointerDown(prop._physId, { x: -9, y: -5 });
        behavior.onPointerMove(prop._physId, { x: -9, y: 80 });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[eid], ROLL_DRIVE_THRUST);
        assert.ok(kineticDynamicSlab.rollDriveDirY[eid] > 0.5);
        assert.notEqual(entityW[eid], 0);
    });

    it("grab torque writes entityW not stale object angularVelocity", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, new WorldProp(0, 0, "tri_wedge", 0));
        const eid = prop._physId;
        entityW[eid] = 0;
        Object.defineProperty(prop, "angularVelocity", { value: 999, writable: true, configurable: true, enumerable: true });
        behavior.onPointerDown(prop._physId, { x: -9, y: -5 });
        behavior.onPointerMove(prop._physId, { x: -9, y: 80 });
        behavior.tickWorld(16);
        assert.notEqual(entityW[eid], 0);
        assert.equal(prop.angularVelocity, 999);
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
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const prop = registerGrabDragTestProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball", angularVelocity: 0 }));
        behavior.onPointerDown(prop._physId, { x: 10, y: 0 });
        behavior.onPointerMove(prop._physId, { x: 10, y: 100 });
        behavior.tickWorld(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[prop._physId], ROLL_DRIVE_THRUST);
        assert.ok(kineticDynamicSlab.rollDriveDirY[prop._physId] > 0.5);
    });

    it("reference grab inertia matches spin for light and heavy polygons", () => {
        const state = createGrabDragTestState();
        const behavior = state.sandbox.behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        const light = registerGrabDragTestProp(state, new WorldProp(0, 0, "tri_wedge", 0));
        const heavy = registerGrabDragTestProp(state, new WorldProp(100, 0, "tri_wedge", 0));
        entityW[light._physId] = 0;
        entityW[heavy._physId] = 0;
        behavior.onPointerDown(light._physId, { x: -9, y: -5 });
        behavior.onPointerMove(light._physId, { x: -9, y: 80 });
        behavior.tickWorld(16);
        const lightSpin = entityW[light._physId];
        behavior.onPointerDown(heavy._physId, { x: 91, y: -5 });
        behavior.onPointerMove(heavy._physId, { x: 91, y: 80 });
        behavior.tickWorld(16);
        assert.ok(Math.abs(lightSpin) > 0);
        assert.ok(Math.abs(entityW[heavy._physId] - lightSpin) < 1e-6);
    });
});
