import { isInsideVoidMouth, voidMouthReach } from "../Spatial/zones/pit.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { isFlipperButtonPressed, triggerFlipper } from "./behaviors/flipperBehavior.js";
import { isButtonPadActive } from "./buttonPad.js";
import { getButtonPadLinks } from "./sandboxPadLinks.js";
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
 */
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
/** @param {object} state @param {import("./sandboxPadLinks.js").ButtonLinkTarget} link */
function runButtonPickupLink(state, link) {
    const pickup = state.pickups.find((entry) => entry.id === link.id && !entry.isDead);
    if (pickup) triggerFlipper(pickup);
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
            const links = getButtonPadLinks(pad);
            if (links.length) {
                for (let i = 0; i < links.length; i++) runButtonPickupLink(state, links[i]);
                return;
            }
            const targetId = trigger.targetPickupId;
            if (targetId == null) return;
            const pickup = state.pickups.find((entry) => entry.id === targetId && !entry.isDead);
            if (pickup) triggerFlipper(pickup);
        },
        isActive(state, pad) {
            if (isButtonPadActive(state, pad)) return true;
            for (const link of getButtonPadLinks(pad)) {
                const pickup = state.pickups.find((entry) => entry.id === link.id && !entry.isDead);
                if (isFlipperButtonPressed(pickup)) return true;
            }
            return false;
        },
    },
};
/** @param {object} state @param {object} pad @param {PadTriggerDef} trigger @param {PadEffectContext} ctx */
export function runPadEffect(state, pad, trigger, ctx) {
    const effect = PAD_EFFECTS[trigger.effect];
    if (!effect) throw new Error(`Unknown pad effect "${trigger.effect}"`);
    effect.run(state, pad, trigger, ctx);
}
/** @param {object} state @param {object} pad @param {PadTriggerDef[]} triggers @param {import("./padPresets.js").PadWhen} when */
export function isPadTriggerActive(state, pad, triggers, when) {
    for (let i = 0; i < triggers.length; i++) {
        const trigger = triggers[i];
        if (trigger.when !== when) continue;
        const effect = PAD_EFFECTS[trigger.effect];
        if (!effect?.isActive) continue;
        if (effect.isActive(state, pad, trigger)) return true;
    }
    return false;
}
