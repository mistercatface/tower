import assert from "node:assert/strict";
import { describe, it } from "node:test";
import propCatalog from "../Assets/props/index.js";
import { BeltPacked } from "../Libraries/Spatial/belts.js";
import { EDITOR_NAV_MODE_HPA, ROLL_DRIVE_THRUST, SANDBOX_BEHAVIOR_GRAB_DRAG, SANDBOX_BEHAVIOR_DRAG_LAUNCH, SANDBOX_BEHAVIOR_GROUND_HPA } from "../Core/engineEnums.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { resolveDragInteractionBehaviorId, assetSupportsDragInteraction } from "../Libraries/Sandbox/dragBehaviors.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import {
    createSandboxDragTestState,
    createSandboxDragTestController,
} from "./harness/sandboxDragHarness.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";

describe("drag interaction mode", () => {
    it("kinetic shape assets support drag; floor belts do not", () => {
        assert.equal(assetSupportsDragInteraction(propCatalog.ball), true);
        assert.equal(assetSupportsDragInteraction(propCatalog.box), true);
        assert.equal(assetSupportsDragInteraction(propCatalog.boid_triangle), true);
        assert.equal(assetSupportsDragInteraction(propCatalog.floor_belt), false);
    });

    it("resolveDragInteractionBehaviorId honors global mode for kinetic props", () => {
        assert.equal(resolveDragInteractionBehaviorId(propCatalog.ball, SANDBOX_BEHAVIOR_DRAG_LAUNCH), SANDBOX_BEHAVIOR_DRAG_LAUNCH);
        assert.equal(resolveDragInteractionBehaviorId(propCatalog.ball, SANDBOX_BEHAVIOR_GRAB_DRAG), SANDBOX_BEHAVIOR_GRAB_DRAG);
    });

    it("boid honors global grab mode", () => {
        assert.equal(assetSupportsDragInteraction(propCatalog.boid_triangle), true);
        assert.equal(resolveDragInteractionBehaviorId(propCatalog.boid_triangle, SANDBOX_BEHAVIOR_GRAB_DRAG), SANDBOX_BEHAVIOR_GRAB_DRAG);
        assert.equal(resolveDragInteractionBehaviorId(propCatalog.boid_triangle, SANDBOX_BEHAVIOR_DRAG_LAUNCH), SANDBOX_BEHAVIOR_DRAG_LAUNCH);
    });

    it("pointer flow flings on launch mode and not on grab mode", () => {
        const state = createSandboxDragTestState();
        const prop = spawnPlacedSandboxProp(state, 64, 64, "ball", "alpha");
        const { controller, eventListeners } = createSandboxDragTestController(state);
        const pointerEvent = (type, clientX, clientY) => {
            const payload = { button: 0, clientX, clientY, pointerId: 1, detail: 1, preventDefault() {}, stopPropagation() {} };
            eventListeners[type](payload);
        };

        controller.setDragInteractionMode(SANDBOX_BEHAVIOR_DRAG_LAUNCH);
        pointerEvent("pointerdown", 64, 64);
        pointerEvent("pointermove", 200, 64);
        pointerEvent("pointerup", 200, 64);
        assert.ok(Math.hypot(prop.vx, prop.vy) > 20);

        prop.vx = 0;
        prop.vy = 0;
        controller.setDragInteractionMode(SANDBOX_BEHAVIOR_GRAB_DRAG);
        pointerEvent("pointerdown", 64, 64);
        pointerEvent("pointermove", 200, 64);
        pointerEvent("pointerup", 200, 64);
        assert.equal(prop.vx, 0);
        assert.equal(prop.vy, 0);

        controller.destroy();
    });

    it("controller setDragInteractionMode switches resolved pointer behavior for ball", () => {
        const state = createSandboxDragTestState();
        const { controller, behaviorById } = createSandboxDragTestController(state);
        const prop = spawnPlacedSandboxProp(state, 64, 64, "ball", "alpha");
        controller.session.select({ kind: "prop", ids: [prop.id] });

        controller.setDragInteractionMode(SANDBOX_BEHAVIOR_DRAG_LAUNCH);
        assert.equal(controller.getDragInteractionMode(), SANDBOX_BEHAVIOR_DRAG_LAUNCH);
        assert.equal(behaviorById.get(SANDBOX_BEHAVIOR_DRAG_LAUNCH).onPointerDown(prop, { x: 64, y: 64 }), true);

        controller.setDragInteractionMode(SANDBOX_BEHAVIOR_GRAB_DRAG);
        assert.equal(controller.getDragInteractionMode(), SANDBOX_BEHAVIOR_GRAB_DRAG);
        const grabBehavior = behaviorById.get(SANDBOX_BEHAVIOR_GRAB_DRAG);
        assert.equal(grabBehavior.onPointerDown(prop, { x: 70, y: 64 }), true);

        controller.destroy();
    });

    it("boid grab mode uses grab drag through pointer flow", () => {
        const state = createSandboxDragTestState();
        state.editor.lockSelection = true;
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "alpha");
        const { controller, eventListeners } = createSandboxDragTestController(state);
        controller.session.select({ kind: "prop", ids: [prop.id] });
        controller.setDragInteractionMode(SANDBOX_BEHAVIOR_GRAB_DRAG);

        const pointerEvent = (type, clientX, clientY, detail = 1) => {
            eventListeners[type]({ button: 0, clientX, clientY, pointerId: 1, detail, timeStamp: detail === 2 ? 1000 : 0, preventDefault() {}, stopPropagation() {} });
        };

        pointerEvent("pointerdown", 64, 64);
        pointerEvent("pointermove", 200, 64);
        for (let i = 0; i < 5; i++) controller.tick(16);
        assert.equal(kineticDynamicSlab.rollDriveKind[prop._physId], ROLL_DRIVE_THRUST);
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), null);

        controller.destroy();
    });

    it("boid double-tap pathing still works in grab mode", () => {
        const state = createSandboxDragTestState();
        state.editor.lockSelection = true;
        state.editor.navMode = EDITOR_NAV_MODE_HPA;
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "alpha");
        const cellIdx = state.obstacleGrid.worldToIdx(100, 100);
        state.obstacleGrid.writeFloorCell(cellIdx, state.obstacleGrid.grid[cellIdx]);
        const { controller, behaviorById, eventListeners } = createSandboxDragTestController(state);
        const hpaBehavior = behaviorById.get(SANDBOX_BEHAVIOR_GROUND_HPA);
        controller.session.select({ kind: "prop", ids: [prop.id] });
        controller.setDragInteractionMode(SANDBOX_BEHAVIOR_GRAB_DRAG);

        let t = 0;
        const pointerEvent = (type, clientX, clientY, detail = 1) => {
            t += 50;
            eventListeners[type]({ button: 0, clientX, clientY, pointerId: 1, detail, timeStamp: t, preventDefault() {}, stopPropagation() {} });
        };

        pointerEvent("pointerdown", 64, 64);
        pointerEvent("pointerup", 64, 64);
        pointerEvent("pointerdown", 100, 100, 2);
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), SANDBOX_BEHAVIOR_GROUND_HPA);
        assert.ok(hpaBehavior.hasMoveTarget(prop._physId));

        controller.destroy();
    });

    it("boid launch mode double-tap starts HPA and drag clears nav", () => {
        const state = createSandboxDragTestState();
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "alpha");
        const cellIdx = worldIdxAtCell(state.obstacleGrid, 22, 22);
        state.obstacleGrid.writeFloorCell(cellIdx, BeltPacked.defaultForSpawn("floor_belt"));
        const { controller, behaviorById, eventListeners } = createSandboxDragTestController(state);
        const hpaBehavior = behaviorById.get(SANDBOX_BEHAVIOR_GROUND_HPA);
        const dragBehavior = behaviorById.get(SANDBOX_BEHAVIOR_DRAG_LAUNCH);

        controller.session.select({ kind: "prop", ids: [prop.id] });
        eventListeners.pointerdown({ button: 0, clientX: 100, clientY: 100, detail: 1, preventDefault() {}, stopPropagation() {} });
        assert.notEqual(controller.session.getSelectedProp()?.id, prop.id);
        eventListeners.pointerdown({ button: 0, clientX: 100, clientY: 100, detail: 2, preventDefault() {}, stopPropagation() {} });

        assert.equal(controller.session.getSelectedProp()?.id, prop.id);
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), SANDBOX_BEHAVIOR_GROUND_HPA);
        assert.ok(hpaBehavior.hasMoveTarget(prop._physId));
        assert.equal(hpaBehavior.getTargetCellIdx(prop._physId), worldIdxAtCell(state.obstacleGrid, 22, 22));

        const cellIdx2 = worldIdxAtCell(state.obstacleGrid, 23, 23);
        state.obstacleGrid.writeFloorCell(cellIdx2, BeltPacked.defaultForSpawn("floor_belt"));
        eventListeners.pointerdown({ button: 0, clientX: 116, clientY: 116, detail: 1, pointerId: 1, preventDefault() {}, stopPropagation() {} });
        eventListeners.pointerup({ clientX: 116, clientY: 116, pointerId: 1, preventDefault() {}, stopPropagation() {} });
        assert.equal(hpaBehavior.getTargetCellIdx(prop._physId), worldIdxAtCell(state.obstacleGrid, 22, 22));
        assert.notEqual(controller.session.getSelectedProp()?.id, prop.id);

        controller.session.select({ kind: "prop", ids: [prop.id] });
        eventListeners.pointerdown({ button: 0, clientX: 64, clientY: 64, detail: 1, pointerId: 1, preventDefault() {}, stopPropagation() {} });

        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), null);
        assert.equal(hpaBehavior.hasMoveTarget(prop._physId), false);
        assert.equal(dragBehavior.onPointerDown(prop, { x: 64, y: 64 }), true);
        controller.destroy();
    });
});
