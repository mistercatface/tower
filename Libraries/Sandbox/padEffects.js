import { CAPTURED_SINK_DURATION_MS } from "../../Entities/worldPropVoidSinkState.js";
import { canEntityFitVoidPit, isInsideVoidMouth, isVoidSinkCaptured } from "../Spatial/zones/pit.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { releaseFlipper, triggerFlipper } from "./behaviors/flipperBehavior.js";
import { getButtonPadLinks } from "./sandboxPadLinks.js";
import { buttonEffectiveActive, isSustainedFlipperButtonInputMode, isSustainedSpawnerButtonInputMode } from "./buttonPad.js";
import { fireSpawner, isSpawnerWorldProp } from "./spawnerConfig.js";
import { isPullPowerTarget, syncPullFixtureWalls, teardownPullFixtureWalls } from "./pullFixtureWalls.js";
/** @typedef {import("./padPresets.js").PadTriggerDef} PadTriggerDef */
/**
 * @typedef {object} PadEffectContext
 * @property {object} [entity]
 * @property {number} [entityId]
 * @property {number} [dtSec]
 * @property {{ x: number, y: number }} [world]
 */
/** @param {number} propId */
function pullPowerKeyForProp(propId) {
    return `prop:${propId}`;
}
/** @param {object} state */
export function syncSandboxPadPower(state) {
    /** @type {Map<string, boolean>} */
    const poweredByTargetId = new Map();
    const pads = state.sandbox.pads;
    for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad.preset !== "button") continue;
        const signal = buttonEffectiveActive(state, pad);
        const links = getButtonPadLinks(pad);
        for (let j = 0; j < links.length; j++) {
            const link = links[j];
            if (link.type !== "worldProp") continue;
            const target = state.entityRegistry.getLive(link.id);
            if (!isPullPowerTarget(target)) continue;
            const key = pullPowerKeyForProp(link.id);
            poweredByTargetId.set(key, (poweredByTargetId.get(key) ?? false) || signal);
        }
    }
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (!isPullPowerTarget(prop)) return;
        const powered = poweredByTargetId.has(pullPowerKeyForProp(prop.id)) ? poweredByTargetId.get(pullPowerKeyForProp(prop.id)) : true;
        prop.powered = powered;
        syncPullFixtureWalls(state, prop);
    });
}
/** @param {object} prop @param {object} source */
function beginSink(prop, source) {
    if (prop.isDead || prop.currentStateName === "voidSink") return;
    const mouthRadius = source.shape?.radius ?? source.radius;
    if (!canEntityFitVoidPit(mouthRadius, prop)) return;
    prop.voidX = source.x;
    prop.voidY = source.y;
    prop.voidRadius = mouthRadius;
    prop.voidDepth = source.sinkDepth;
    prop.voidCaptureTolerance = source.captureTolerance;
    prop.voidCaptured = isVoidSinkCaptured(source.x, source.y, mouthRadius, prop, source.captureTolerance);
    if (prop.voidCaptured) prop.voidSinkTimer = CAPTURED_SINK_DURATION_MS;
    else delete prop.voidSinkTimer;
    prop.changeState("voidSink");
}
/** @param {object} state @param {number} entityId @param {object} source */
function rimOutSink(state, entityId, source) {
    const prop = state.entityRegistry.get(entityId);
    if (!prop || prop.currentStateName !== "voidSink" || prop.voidCaptured) return;
    const mouthRadius = source.shape?.radius ?? source.radius;
    if (isInsideVoidMouth(source.x, source.y, mouthRadius, prop)) return;
    prop.changeState("normal");
}
/** @param {object} state @param {import("./sandboxPadLinks.js").ButtonLinkWorldPropTarget} link @param {object} buttonPad */
function runButtonWorldPropLink(state, link, buttonPad) {
    const prop = state.entityRegistry.getLive(link.id);
    if (!prop || isSpawnerWorldProp(prop)) return;
    if (isSustainedFlipperButtonInputMode(buttonPad.inputMode)) return;
    if (buttonPad.invert) releaseFlipper(prop);
    else triggerFlipper(prop, { hold: false });
}
/** @param {object} state @param {object} buttonPad */
export function tickButtonSpawnerLinks(state, buttonPad) {
    const active = buttonEffectiveActive(state, buttonPad);
    const wasActive = buttonPad._spawnerButtonWasActive ?? false;
    const sustained = isSustainedSpawnerButtonInputMode(buttonPad.inputMode);
    if (active && (sustained || !wasActive)) {
        const links = getButtonPadLinks(buttonPad);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "worldProp") continue;
            const prop = state.entityRegistry.getLive(link.id);
            if (!prop || !isSpawnerWorldProp(prop)) continue;
            fireSpawner(state, prop);
        }
    }
    buttonPad._spawnerButtonWasActive = active;
}
/** @param {object} state @param {object} buttonPad */
export function syncButtonFlipperLinks(state, buttonPad) {
    const active = buttonEffectiveActive(state, buttonPad);
    const links = getButtonPadLinks(buttonPad);
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.type !== "worldProp") continue;
        const prop = state.entityRegistry.getLive(link.id);
        if (!prop || isSpawnerWorldProp(prop)) continue;
        if (active) triggerFlipper(prop);
        else releaseFlipper(prop);
    }
}
/** @type {Record<string, { run: (state: object, pad: object, trigger: PadTriggerDef, ctx: PadEffectContext) => void }>} */
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
                const prop = state.entityRegistry.get(entityId);
                if (!prop || prop.isDead || prop.strategy.gravityImmune) continue;
                wakePushableBody(prop);
                if (prop.isSleeping) continue;
                prop.vx += forceX * dtSec;
                prop.vy += forceY * dtSec;
            }
        },
    },
    button: {
        run(state, pad) {
            const links = getButtonPadLinks(pad);
            for (let i = 0; i < links.length; i++) {
                const link = links[i];
                if (link.type === "worldProp") runButtonWorldPropLink(state, link, pad);
            }
        },
    },
};
/** @param {object} state @param {object} pad @param {PadTriggerDef} trigger @param {PadEffectContext} ctx */
export function runPadEffect(state, pad, trigger, ctx) {
    const effect = PAD_EFFECTS[trigger.effect];
    if (!effect) throw new Error(`Unknown pad effect "${trigger.effect}"`);
    effect.run(state, pad, trigger, ctx);
}
