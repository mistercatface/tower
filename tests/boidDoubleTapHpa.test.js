import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import {  WorldObstacleGrid, BeltPacked  } from "../Libraries/Spatial/spatial.js";
import { createSandboxController, spawnPlacedSandboxProp, createDefaultSandboxBehaviors, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/sandbox.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
function createEditorTestState() {
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        viewport: {
            x: 128,
            y: 128,
            snapTo() {},
            circleInBounds() {
                return true;
            },
        },
        worldSurfaces: { settings: { maxWallHeightLevel: 8 } },
        editor: { showSelectionRings: true },
        nav: {
            settings: { stuckMoveThreshold: 0.5, stuckReplanFrames: 6, pathOffPathDistance: 4 },
            topologyKey() {
                return "mockKey";
            },
            syncedTopologyKey() {
                return "mockKey";
            },
            worker: { releaseOwnedPathSlot() {} },
            session: {
                isReplanInFlight() {
                    return false;
                },
                requestReplan() {
                    return true;
                },
            },
        },
    };
}
describe("boid double tap hpa pathing", () => {
    it("starts HPA ground nav on double-tap when selected, reverts to dragLaunch on drag", () => {
        const state = createEditorTestState();
        // Spawn the boid triangle prop
        const prop = spawnPlacedSandboxProp(state, 64, 64, "boid_triangle", "neutral");
        // Write a floor cell at col: 22, row: 22 to ensure Click 1 changes selection to floor
        const cellIdx = worldIdxAtCell(state.obstacleGrid, 22, 22);
        state.obstacleGrid.writeFloorCell(cellIdx, BeltPacked.defaultForSpawn("floor_belt"));
        // Setup mock canvas with listener recording
        const eventListeners = {};
        const canvas = {
            addEventListener(type, listener) {
                eventListeners[type] = listener;
            },
            removeEventListener(type, listener) {
                delete eventListeners[type];
            },
            setPointerCapture() {},
            releasePointerCapture() {},
        };
        // Setup behaviors
        const allBehaviors = createDefaultSandboxBehaviors(state);
        const behaviorById = new Map(allBehaviors.map((behavior) => [behavior.id, behavior]));
        const behaviors = [behaviorById.get("dragLaunch"), behaviorById.get(HPA_GROUND_NAV_BEHAVIOR_ID)];
        // Setup controller
        const controller = createSandboxController(state, { getCanvas: () => canvas, clientToWorld: (clientX, clientY) => ({ x: clientX, y: clientY }), behaviors });
        controller.register();
        // Initially, the boid triangle is not selected
        assert.equal(controller.session.getSelectedProp(), null);
        // 1. Select the boid triangle
        controller.session.select({ kind: "prop", ids: [prop.id] });
        assert.equal(controller.session.getSelectedProp(), prop);
        // Verify default active behavior is dragLaunch
        assert.equal(controller.getSelectedBehaviorId(), "dragLaunch");
        // 2. Perform a single click on empty ground (e.g. at x: 100, y: 100)
        // Click 1:
        eventListeners.pointerdown({ button: 0, clientX: 100, clientY: 100, detail: 1, preventDefault() {}, stopPropagation() {} });
        // Click 1 will deselect the boid triangle and select the floor (as per standard editor rules)
        assert.notEqual(controller.session.getSelectedProp()?.id, prop.id);
        // But since this is a potential double click, the tool remembers the previously selected boid.
        // Let's fire the second click (Click 2) at the same spot within 200ms
        eventListeners.pointerdown({ button: 0, clientX: 100, clientY: 100, detail: 2, preventDefault() {}, stopPropagation() {} });
        // After Click 2, the selection should be restored to the boid triangle, and HPA pathing should be active!
        assert.equal(controller.session.getSelectedProp()?.id, prop.id);
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), "rollToCursorHpa");
        // Check that the move target is set
        const hpaBehavior = behaviors.find((b) => b.id === "rollToCursorHpa");
        assert.ok(hpaBehavior.hasMoveTarget(prop));
        const targetIdx = hpaBehavior.getTargetCellIdx(prop);
        assert.equal(targetIdx, worldIdxAtCell(state.obstacleGrid, 22, 22));
        // 3. Verify a subsequent single click on the ground does NOT update the path, and deselects the boid instead
        // Write another floor cell at col: 23, row: 23 (x: 116, y: 116)
        const cellIdx2 = worldIdxAtCell(state.obstacleGrid, 23, 23);
        state.obstacleGrid.writeFloorCell(cellIdx2, BeltPacked.defaultForSpawn("floor_belt"));
        eventListeners.pointerdown({ button: 0, clientX: 116, clientY: 116, detail: 1, pointerId: 1, preventDefault() {}, stopPropagation() {} });
        eventListeners.pointerup({ clientX: 116, clientY: 116, pointerId: 1, preventDefault() {}, stopPropagation() {} });
        const newTargetIdx = hpaBehavior.getTargetCellIdx(prop);
        assert.equal(newTargetIdx, worldIdxAtCell(state.obstacleGrid, 22, 22));
        // The selection should have been changed/cleared from the boid
        assert.notEqual(controller.session.getSelectedProp()?.id, prop.id);
        // Re-select the boid so we can test the drag-launch restoration next
        controller.session.select({ kind: "prop", ids: [prop.id] });
        // 4. Now let's click/drag directly on the boid triangle itself to test drag launch restoration.
        // The boid is at x: 64, y: 64 (world coordinates), so we simulate clicking at x: 64, y: 64.
        eventListeners.pointerdown({ button: 0, clientX: 64, clientY: 64, detail: 1, pointerId: 1, preventDefault() {}, stopPropagation() {} });
        // Click/drag on the boid triangle must revert its behavior to dragLaunch and cancel the HPA move target
        assert.equal(state.sandbox.entityMeta.getActiveBehaviorId(prop.id), "dragLaunch");
        assert.equal(hpaBehavior.hasMoveTarget(prop), false);
        controller.destroy();
    });
});
