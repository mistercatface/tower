import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BeltPacked } from "../Libraries/Spatial/belts.js";
import { spawnPlacedSandboxProp, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/sandbox.js";
import { DRAG_LAUNCH_BEHAVIOR_ID } from "../Libraries/Sandbox/dragBehaviors.js";
import { createSandboxDragTestState, createSandboxDragTestController } from "./harness/sandboxDragHarness.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";

describe("boid double tap hpa pathing", () => {
    it("starts HPA ground nav on double-tap when selected, clears nav on drag", () => {
        const state = createSandboxDragTestState();
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "alpha");
        const cellIdx = worldIdxAtCell(state.obstacleGrid, 22, 22);
        state.obstacleGrid.writeFloorCell(cellIdx, BeltPacked.defaultForSpawn("floor_belt"));
        const { controller, behaviorById, eventListeners } = createSandboxDragTestController(state);
        const hpaBehavior = behaviorById.get(HPA_GROUND_NAV_BEHAVIOR_ID);
        const dragBehavior = behaviorById.get(DRAG_LAUNCH_BEHAVIOR_ID);

        assert.equal(controller.session.getSelectedProp(), null);
        controller.session.select({ kind: "prop", ids: [prop.id] });
        assert.equal(controller.session.getSelectedProp(), prop);
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), null);

        eventListeners.pointerdown({ button: 0, clientX: 100, clientY: 100, detail: 1, preventDefault() {}, stopPropagation() {} });
        assert.notEqual(controller.session.getSelectedProp()?.id, prop.id);
        eventListeners.pointerdown({ button: 0, clientX: 100, clientY: 100, detail: 2, preventDefault() {}, stopPropagation() {} });

        assert.equal(controller.session.getSelectedProp()?.id, prop.id);
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), HPA_GROUND_NAV_BEHAVIOR_ID);
        assert.ok(hpaBehavior.hasMoveTarget(prop));
        assert.equal(hpaBehavior.getTargetCellIdx(prop), worldIdxAtCell(state.obstacleGrid, 22, 22));

        const cellIdx2 = worldIdxAtCell(state.obstacleGrid, 23, 23);
        state.obstacleGrid.writeFloorCell(cellIdx2, BeltPacked.defaultForSpawn("floor_belt"));
        eventListeners.pointerdown({ button: 0, clientX: 116, clientY: 116, detail: 1, pointerId: 1, preventDefault() {}, stopPropagation() {} });
        eventListeners.pointerup({ clientX: 116, clientY: 116, pointerId: 1, preventDefault() {}, stopPropagation() {} });
        assert.equal(hpaBehavior.getTargetCellIdx(prop), worldIdxAtCell(state.obstacleGrid, 22, 22));
        assert.notEqual(controller.session.getSelectedProp()?.id, prop.id);

        controller.session.select({ kind: "prop", ids: [prop.id] });
        eventListeners.pointerdown({ button: 0, clientX: 64, clientY: 64, detail: 1, pointerId: 1, preventDefault() {}, stopPropagation() {} });

        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), null);
        assert.equal(hpaBehavior.hasMoveTarget(prop), false);
        assert.equal(dragBehavior.onPointerDown(prop, { x: 64, y: 64 }), true);
        controller.destroy();
    });
});
