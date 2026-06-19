import test from "node:test";
import assert from "node:assert/strict";
import { SandboxEntityMetaStore } from "../GameState/sandboxEntityMeta.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { createDragLaunchWaitBehavior } from "../Libraries/Sandbox/dragLaunch.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { resolveGroundNavPathOverlayBehavior } from "../Libraries/Sandbox/groundNav/resolveGroundNavPathOverlayBehavior.js";

test("resolveGroundNavPathOverlayBehavior uses stamped ground nav even when spawn behaviors omit it", () => {
    const state = { sandbox: { entityMeta: new SandboxEntityMetaStore() } };
    const hpaBehavior = createHpaGroundNavBehavior(state);
    const dragLaunchWait = createDragLaunchWaitBehavior(state);
    const behaviorById = new Map([
        [hpaBehavior.id, hpaBehavior],
        [dragLaunchWait.id, dragLaunchWait],
    ]);
    const prop = { id: 1, x: 24, y: 24, radius: 2, type: "snake_striker" };
    state.sandbox.entityMeta.setActiveBehaviorId(prop.id, HPA_GROUND_NAV_BEHAVIOR_ID);

    const resolved = resolveGroundNavPathOverlayBehavior(state, prop, behaviorById);
    assert.equal(resolved?.id, HPA_GROUND_NAV_BEHAVIOR_ID);
});

test("resolveGroundNavPathOverlayBehavior returns null without active ground nav", () => {
    const state = { sandbox: { entityMeta: new SandboxEntityMetaStore() } };
    const hpaBehavior = createHpaGroundNavBehavior(state);
    const behaviorById = new Map([[hpaBehavior.id, hpaBehavior]]);
    const prop = { id: 1, x: 24, y: 24, radius: 2, type: "snake_striker" };

    assert.equal(resolveGroundNavPathOverlayBehavior(state, prop, behaviorById), null);
});
