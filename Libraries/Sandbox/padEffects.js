import { Segment } from "../../Entities/Wall.js";
import { DEFAULT_PIT_DEPTH, isInsideVoidMouth, voidMouthReach } from "../Spatial/zones/pit.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { isFlipperButtonPressed, triggerFlipper } from "./behaviors/flipperBehavior.js";
import { addSandboxWalls, removeSandboxWall } from "./spawnAssembly.js";
/** @typedef {import("./padPresets.js").PadTriggerDef} PadTriggerDef */
/**
 * @typedef {object} PadEffectContext
 * @property {object} [entity]
 * @property {number} [entityId]
 * @property {number} [dtSec]
 * @property {{ x: number, y: number }} [world]
 */
/**
 * @typedef {object} PadEffectHandler
 * @property {(state: object, pad: object, trigger: PadTriggerDef, ctx: PadEffectContext) => void} run
 * @property {(state: object, pad: object, trigger: PadTriggerDef) => boolean} [isActive]
 * @property {(state: object, pad: object) => void} [setup]
 * @property {(state: object, pad: object) => void} [teardown]
 */
const GATE_WALL_HEIGHT = 1;
const GATE_WALL_SIZE = 16;
const GATE_WALL_OFFSET_Y = -18;
/** @param {number} x @param {number} y @param {string} ownerId */
function buildGateWall(x, y, ownerId) {
    const wall = new Segment(x, y + GATE_WALL_OFFSET_Y, 0, GATE_WALL_SIZE, 0, 30, 30, false, GATE_WALL_HEIGHT);
    wall.collisionOnly = true;
    wall.sandboxPadId = ownerId;
    return wall;
}
/** @param {object} state @param {object} pad @param {boolean} wallsUp */
function setGateWalls(state, pad, wallsUp) {
    if (pad.wallsUp === wallsUp) return;
    if (wallsUp) {
        pad.walls = [buildGateWall(pad.x, pad.y, pad.id)];
        addSandboxWalls(state, pad.walls, { compileRender: false });
    } else {
        for (let i = 0; i < pad.walls.length; i++) removeSandboxWall(state, pad.walls[i]);
        pad.walls = [];
    }
    pad.wallsUp = wallsUp;
}
/** @param {object} pickup @param {object} pad */
function beginSink(pickup, pad) {
    if (pickup.isDead || pickup.currentStateName === "voidSink") return;
    pickup.voidX = pad.x;
    pickup.voidY = pad.y;
    pickup.voidRadius = pad.shape.radius;
    pickup.voidDepth = pad.sinkDepth;
    pickup.voidSinkTimer = 1500;
    pickup.voidCaptured = Math.hypot(pad.x - pickup.x, pad.y - pickup.y) <= voidMouthReach(pad.shape.radius, pickup) * 0.65;
    pickup.changeState("voidSink");
}
/** @param {object} state @param {number} entityId @param {object} pad */
function rimOutSink(state, entityId, pad) {
    const pickup = state.pickups.find((entry) => entry.id === entityId);
    if (!pickup || pickup.currentStateName !== "voidSink" || pickup.voidCaptured) return;
    if (isInsideVoidMouth(pad.x, pad.y, pad.shape.radius, pickup)) return;
    pickup.changeState("normal");
}
/** @param {object} state @param {PadTriggerDef} trigger @param {object} pad */
export function resolvePadTargetPickup(state, trigger, pad) {
    const targetId = trigger.targetPickupId ?? pad.targetPickupId;
    return state.pickups.find((entry) => entry.id === targetId && !entry.isDead);
}
/** @type {Record<string, PadEffectHandler>} */
const PAD_EFFECTS = {
    sink: {
        run(_state, pad, _trigger, ctx) {
            beginSink(ctx.entity, pad);
        },
    },
    unsink: {
        run(state, pad, _trigger, ctx) {
            rimOutSink(state, ctx.entityId, pad);
        },
    },
    gate: {
        setup(state, pad) {
            pad.wallsUp = true;
            pad.walls = [buildGateWall(pad.x, pad.y, pad.id)];
            addSandboxWalls(state, pad.walls, { compileRender: false });
        },
        teardown(state, pad) {
            if (pad.wallsUp) setGateWalls(state, pad, false);
        },
        run(state, pad, trigger) {
            setGateWalls(state, pad, trigger.up === true);
        },
    },
    pull: {
        run(state, pad, trigger, ctx) {
            const { forceX, forceY } = trigger;
            const dtSec = ctx.dtSec;
            for (const entityId of pad._occupants) {
                const pickup = state.pickups.find((entry) => entry.id === entityId);
                if (!pickup || pickup.isDead || pickup.strategy.gravityImmune) continue;
                wakePushableBody(pickup);
                if (pickup.isSleeping) continue;
                pickup.vx += forceX * dtSec;
                pickup.vy += forceY * dtSec;
            }
        },
    },
    flipper: {
        run(state, pad, trigger) {
            triggerFlipper(resolvePadTargetPickup(state, trigger, pad));
        },
        isActive(state, pad, trigger) {
            return isFlipperButtonPressed(resolvePadTargetPickup(state, trigger, pad));
        },
    },
};
/** @returns {string[]} */
export function listPadEffectIds() {
    return Object.keys(PAD_EFFECTS);
}
/** @param {object} state @param {object} pad @param {import("./padPresets.js").PadPresetDef} preset */
export function setupPadPresetEffects(state, pad, preset) {
    if (preset.linkedWalls) PAD_EFFECTS.gate.setup(state, pad);
}
/** @param {object} state @param {object} pad */
export function teardownSandboxPadEffects(state, pad) {
    if (pad.wallsUp) PAD_EFFECTS.gate.teardown(state, pad);
}
/** @param {object} state @param {object} pad @param {PadTriggerDef} trigger @param {PadEffectContext} ctx */
export function runPadEffect(state, pad, trigger, ctx) {
    PAD_EFFECTS[trigger.effect].run(state, pad, trigger, ctx);
}
/** @param {object} state @param {object} pad @param {PadTriggerDef[]} triggers @param {import("./padPresets.js").PadWhen} when */
export function isPadTriggerActive(state, pad, triggers, when) {
    for (let i = 0; i < triggers.length; i++) {
        const trigger = triggers[i];
        if (trigger.when !== when) continue;
        const isActive = PAD_EFFECTS[trigger.effect].isActive;
        if (isActive && isActive(state, pad, trigger)) return true;
    }
    return false;
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../../Entities/Wall.js").Segment} wall */
export function drawGateWall(ctx, wall) {
    ctx.save();
    ctx.translate(wall.x, wall.y);
    ctx.rotate(wall.angle);
    const half = wall.size / 2;
    const thickness = 4;
    ctx.fillStyle = "rgba(76, 175, 80, 0.85)";
    ctx.strokeStyle = "rgba(27, 94, 32, 1)";
    ctx.lineWidth = 2;
    ctx.fillRect(-half, -thickness / 2, wall.size, thickness);
    ctx.strokeRect(-half, -thickness / 2, wall.size, thickness);
    ctx.restore();
}
