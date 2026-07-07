import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../Libraries/Sandbox/sandbox.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { applyGroundRollDrive } from "../Libraries/Physics/physics.js";
import {
    createGrabDragBehavior,
    createDefaultSandboxBehaviors,
    getGrabDragConfig,
    GRAB_DRAG_BEHAVIOR_ID,
    spawnLinkedBallChain,
} from "../Libraries/Sandbox/sandbox.js";
import { mockRollingProp } from "./harness/kineticTickHarness.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import propCatalog from "../Assets/props/index.js";

function createGrabDragTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    const entityRegistry = new EntityRegistry();
    const world = {
        obstacleGrid: grid,
        entityRegistry,
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        nav: {
            worker: { releaseOwnedPathSlot() {} },
            session: { isReplanInFlight() { return false; }, requestReplan() { return true; } },
        },
    };
    world.fractureEngine = new FractureEngine(world);
    const behaviors = createDefaultSandboxBehaviors(world);
    world.sandbox.behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    return world;
}

function registerProp(state, prop) {
    state.worldProps.push(prop);
    state.entityRegistry.register("worldProp", prop);
    return prop;
}

describe("grabDrag behavior", () => {
    it("getGrabDragConfig prefers grabDrag over dragLaunch", () => {
        const asset = { sandbox: { grabDrag: { minPower: 1 }, dragLaunch: { minPower: 99 } } };
        assert.equal(getGrabDragConfig(asset).minPower, 1);
        assert.equal(getGrabDragConfig({ sandbox: { dragLaunch: { minPower: 42 } } }).minPower, 42);
    });

    it("onPointerDown returns true for kinetic props and false otherwise", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const kinetic = registerProp(state, mockRollingProp({ id: 1, x: 32, y: 32, type: "ball" }));
        const staticProp = registerProp(state, { id: 2, x: 48, y: 48, strategy: { isKinetic: false }, isDead: false });
        assert.equal(behavior.onPointerDown(kinetic, { x: 32, y: 32 }), true);
        assert.equal(behavior.onPointerDown(staticProp, { x: 48, y: 48 }), false);
    });

    it("tickWorld steers toward pull target instead of teleporting", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        assert.ok(behavior.onPointerDown(prop, { x: 0, y: 0 }));
        behavior.onPointerMove(prop, { x: 120, y: 0 });
        behavior.tickWorld(16);
        assert.ok(prop._groundRollDrive);
        assert.equal(prop._groundRollDrive.kind, "thrust");
        assert.ok(prop._groundRollDrive.dirX > 0.9);
        assert.ok(Math.abs(prop.x) < 20);
    });

    it("sustains thrust while cursor stays beyond a wall without snapping through", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball" }));
        behavior.onPointerDown(prop, { x: 0, y: 0 });
        behavior.onPointerMove(prop, { x: 200, y: 0 });
        for (let i = 0; i < 5; i++) behavior.tickWorld(16);
        assert.ok(prop._groundRollDrive);
        assert.ok(prop.x < 100);
    });

    it("onPointerUp clears roll drive but keeps momentum", () => {
        const state = createGrabDragTestState();
        const behavior = createGrabDragBehavior(state);
        const prop = registerProp(state, mockRollingProp({ id: 1, x: 0, y: 0, type: "ball", vx: 12, vy: 3 }));
        behavior.onPointerDown(prop, { x: 0, y: 0 });
        behavior.onPointerMove(prop, { x: 80, y: 0 });
        behavior.tickWorld(16);
        assert.ok(prop._groundRollDrive);
        behavior.onPointerUp(prop);
        assert.equal(prop._groundRollDrive, undefined);
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
        assert.ok(middle._groundRollDrive);
        assert.equal(chain.head._groundRollDrive, undefined);
        assert.notEqual(chain.head.x, middle.x);
        assert.ok(Math.abs(chain.head.x - headX) < 40);
    });

    it("is registered in createDefaultSandboxBehaviors", () => {
        const state = createGrabDragTestState();
        const ids = createDefaultSandboxBehaviors(state).map((behavior) => behavior.id);
        assert.ok(ids.includes(GRAB_DRAG_BEHAVIOR_ID));
    });

    it("ball asset lists grabDrag behavior", () => {
        assert.ok(propCatalog.ball.sandbox.behaviors.includes("grabDrag"));
    });
});
