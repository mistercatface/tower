import { CAPTURED_SINK_DURATION_MS } from "../../Entities/worldPropVoidSinkState.js";
import { canEntityFitVoidPit, isInsideVoidMouth, isVoidSinkCaptured } from "../Spatial/zones/pit.js";
import { floorCircleRadius } from "../Spatial/zones/floorShapes.js";
import { applyPushableAcceleration } from "../Motion/applyAcceleration.js";
import { releaseFlipper, triggerFlipper } from "./behaviors/flipperBehavior.js";
import { forEachButtonEntity, getButtonLinks } from "./buttonLinks.js";
import { buttonEffectiveActive, isSustainedFlipperButtonInputMode, isSustainedSpawnerButtonInputMode } from "./buttonInput.js";
import { fireSpawner, isSpawnerWorldProp } from "./spawnerConfig.js";
import { isPullPowerTarget, syncPullFixtureWalls } from "./pullFixtureWalls.js";
/** @typedef {{ when?: FloorTriggerWhen, effect: string, force?: number, forceX?: number, forceY?: number }} FloorTriggerDef */
/** @typedef {"enter" | "exit" | "occupied" | "empty"} FloorTriggerWhen */
/**
 * @typedef {object} FloorEffectContext
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
export function syncSandboxButtonPower(state) {
    /** @type {Map<string, boolean>} */
    const poweredByTargetId = new Map();
    forEachButtonEntity(state, (button) => {
        const signal = buttonEffectiveActive(state, button);
        const links = getButtonLinks(button);
        for (let j = 0; j < links.length; j++) {
            const link = links[j];
            if (link.type !== "worldProp") continue;
            const target = state.entityRegistry.getLive(link.id);
            if (!isPullPowerTarget(target)) continue;
            const key = pullPowerKeyForProp(link.id);
            poweredByTargetId.set(key, (poweredByTargetId.get(key) ?? false) || signal);
        }
    });
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (!isPullPowerTarget(prop)) return;
        const powered = poweredByTargetId.has(pullPowerKeyForProp(prop.id)) ? poweredByTargetId.get(pullPowerKeyForProp(prop.id)) : true;
        prop.powered = powered;
        syncPullFixtureWalls(state, prop);
    });
}
/** @param {object} prop @param {object} pit */
function beginSink(prop, pit) {
    if (prop.isDead || prop.currentStateName === "voidSink") return;
    const mouthRadius = floorCircleRadius(pit);
    if (!canEntityFitVoidPit(mouthRadius, prop)) return;
    prop.voidX = pit.x;
    prop.voidY = pit.y;
    prop.voidRadius = mouthRadius;
    prop.voidDepth = pit.sinkDepth;
    prop.voidCaptureTolerance = pit.captureTolerance;
    prop.voidCaptured = isVoidSinkCaptured(pit.x, pit.y, mouthRadius, prop, pit.captureTolerance);
    if (prop.voidCaptured) prop.voidSinkTimer = CAPTURED_SINK_DURATION_MS;
    else delete prop.voidSinkTimer;
    prop.changeState("voidSink");
}
/** @param {object} state @param {number} entityId @param {object} pit */
function rimOutSink(state, entityId, pit) {
    const prop = state.entityRegistry.get(entityId);
    if (!prop || prop.currentStateName !== "voidSink" || prop.voidCaptured) return;
    const mouthRadius = floorCircleRadius(pit);
    if (isInsideVoidMouth(pit.x, pit.y, mouthRadius, prop)) return;
    prop.changeState("normal");
}
/** @param {object} state @param {import("./buttonLinks.js").ButtonLinkTarget} link @param {object} button */
function runButtonWorldPropLink(state, link, button) {
    const prop = state.entityRegistry.getLive(link.id);
    if (!prop || isSpawnerWorldProp(prop)) return;
    if (isSustainedFlipperButtonInputMode(button.inputMode)) return;
    if (button.invert) releaseFlipper(prop);
    else triggerFlipper(prop, { hold: false });
}
/** @param {object} state @param {object} button @param {FloorEffectContext} [ctx] */
export function runButtonTapLinks(state, button, ctx = {}) {
    const links = getButtonLinks(button);
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.type === "worldProp") runButtonWorldPropLink(state, link, button);
    }
}
/** @param {object} state @param {object} button */
export function tickButtonSpawnerLinks(state, button) {
    const active = buttonEffectiveActive(state, button);
    const wasActive = button._spawnerButtonWasActive ?? false;
    const sustained = isSustainedSpawnerButtonInputMode(button.inputMode);
    if (active && (sustained || !wasActive)) {
        const links = getButtonLinks(button);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "worldProp") continue;
            const prop = state.entityRegistry.getLive(link.id);
            if (!prop || !isSpawnerWorldProp(prop)) continue;
            fireSpawner(state, prop);
        }
    }
    button._spawnerButtonWasActive = active;
}
/** @param {object} state @param {object} button */
export function syncButtonFlipperLinks(state, button) {
    const active = buttonEffectiveActive(state, button);
    const links = getButtonLinks(button);
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.type !== "worldProp") continue;
        const prop = state.entityRegistry.getLive(link.id);
        if (!prop || isSpawnerWorldProp(prop)) continue;
        if (active) triggerFlipper(prop);
        else releaseFlipper(prop);
    }
}
/** @type {Record<string, { run: (state: object, floorProp: object, trigger: FloorTriggerDef, ctx: FloorEffectContext) => void }>} */
const FLOOR_EFFECTS = {
    sink: {
        run(_state, pit, _trigger, ctx) {
            beginSink(ctx.entity, pit);
        },
    },
    unsink: {
        run(state, pit, _trigger, ctx) {
            rimOutSink(state, ctx.entityId, pit);
        },
    },
    pull: {
        run(state, floorProp, trigger, ctx) {
            const dtSec = ctx.dtSec;
            for (const entityId of floorProp._occupants) {
                const prop = state.entityRegistry.get(entityId);
                applyPushableAcceleration(prop, trigger.forceX, trigger.forceY, dtSec);
            }
        },
    },
};
/** @param {object} state @param {object} floorProp @param {FloorTriggerDef} trigger @param {FloorEffectContext} ctx */
export function runFloorEffect(state, floorProp, trigger, ctx) {
    const effect = FLOOR_EFFECTS[trigger.effect];
    if (!effect) throw new Error(`Unknown floor effect "${trigger.effect}"`);
    effect.run(state, floorProp, trigger, ctx);
}
