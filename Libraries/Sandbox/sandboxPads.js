import { createCircleFloorShape, createRectFloorShape, drawFloorShape, isAabbInView, processFloorShapes, syncPadQueryAabb } from "../Spatial/zones/floorShapes.js";
import { addPadToState, clearPadsInState, removePadFromState } from "../../GameState/EntityRegistry.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { fillCircle, strokeCircle } from "../Canvas/CanvasPath.js";
import { PAD_PRESETS } from "./padPresets.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { runPadEffect, syncButtonFlipperLinks, syncSandboxPadPower, tickButtonSpawnerLinks } from "./padEffects.js";
import {
    DEFAULT_BUTTON_INPUT_MODE,
    DEFAULT_BUTTON_MASS_THRESHOLD,
    buttonPadMass,
    isButtonPadActive,
    isMassButtonInputMode,
    isSustainedFlipperButtonInputMode,
    isToggleInputMode,
} from "./buttonPad.js";
export const SANDBOX_SPAWN_PAD_PREFIX = "pad:";
const POINTER_HIT_PADDING = 4;
/** @param {string} preset */
export function sandboxSpawnPadId(preset) {
    return `${SANDBOX_SPAWN_PAD_PREFIX}${preset}`;
}
/** @param {string} spawnId */
export function isSandboxSpawnPadId(spawnId) {
    return spawnId.startsWith(SANDBOX_SPAWN_PAD_PREFIX);
}
/** @param {string} spawnId */
export function parseSandboxPadPreset(spawnId) {
    return spawnId.slice(SANDBOX_SPAWN_PAD_PREFIX.length);
}
/** @param {object} state @param {object} pad */
function padHasOccupant(state, pad) {
    for (const entityId of pad._occupants) {
        const prop = state.entityRegistry.get(entityId);
        if (prop && !prop.isDead) return true;
    }
    return false;
}
/** @param {object} state @param {object} pad @param {import("./padPresets.js").PadWhen} when @param {import("./padEffects.js").PadEffectContext} ctx */
function runPadTriggers(state, pad, when, ctx) {
    for (let i = 0; i < pad.triggers.length; i++) {
        const trigger = pad.triggers[i];
        if (trigger.when === when) runPadEffect(state, pad, trigger, ctx);
    }
}
/** @param {object} state @param {object} pad @param {import("./padEffects.js").PadEffectContext} [ctx] */
function runButtonPadEffects(state, pad, ctx = {}) {
    for (let i = 0; i < pad.triggers.length; i++) runPadEffect(state, pad, pad.triggers[i], ctx);
}
/** @param {object} pad @param {number} wx @param {number} wy @param {number} [padding] */
function pointInPad(pad, wx, wy, padding = POINTER_HIT_PADDING) {
    const shape = pad.shape;
    if (shape.type === "Circle") return Math.hypot(wx - pad.x, wy - pad.y) <= shape.radius + padding;
    const verts = shape.vertices;
    let halfW = 0;
    let halfH = 0;
    for (let i = 0; i < verts.length; i++) {
        halfW = Math.max(halfW, Math.abs(verts[i].x));
        halfH = Math.max(halfH, Math.abs(verts[i].y));
    }
    return Math.abs(wx - pad.x) <= halfW + padding && Math.abs(wy - pad.y) <= halfH + padding;
}
/** @param {object} state @param {number} wx @param {number} wy */
export function hitTestPad(state, wx, wy) {
    const pads = state.sandbox.pads;
    for (let i = pads.length - 1; i >= 0; i--) if (pointInPad(pads[i], wx, wy)) return pads[i];
    return null;
}
/** @param {object} state @param {object} pad @param {{ x: number, y: number }} world */
export function handlePadPointerDown(state, pad, world) {
    if (pad.preset !== "button" || isMassButtonInputMode(pad.inputMode)) return false;
    if (pad.inputMode === "toggle") {
        pad._toggleLatched = !pad._toggleLatched;
        return true;
    }
    pad._pointerHeld = true;
    if (pad.inputMode === "tap" && pad.invert) return true;
    runButtonPadEffects(state, pad, { world });
    return true;
}
/** @param {object} state */
export function releaseButtonPointerHold(state) {
    for (let i = 0; i < state.sandbox.pads.length; i++) {
        const pad = state.sandbox.pads[i];
        if (pad.preset !== "button" || isMassButtonInputMode(pad.inputMode) || pad.inputMode === "toggle") continue;
        if (pad.inputMode === "tap" && pad.invert) runButtonPadEffects(state, pad);
        pad._pointerHeld = false;
    }
}
/**
 * @param {object} state
 * @param {string} preset
 * @param {number} x
 * @param {number} y
 * @param {{
 *   id?: string,
 *   radius?: number,
 *   halfWidth?: number,
 *   halfHeight?: number,
 *   buttonLinks?: import("./sandboxPadLinks.js").ButtonLinkTarget[],
 *   inputMode?: import("./buttonPad.js").ButtonInputMode,
 *   massThreshold?: number,
 *   invert?: boolean,
 *   triggers?: object[],
 * }} [options]
 */
export function buildSandboxPad(state, preset, x, y, options = {}) {
    const def = PAD_PRESETS[preset];
    if (!def) throw new Error(`Unknown pad preset "${preset}"`);
    const id = options.id ?? `${preset}:${state.sandbox.pads.length + 1}`;
    /** @type {object} */
    let pad;
    if (options.halfWidth != null && options.halfHeight != null) {
        pad = createRectFloorShape(x, y, options.halfWidth, options.halfHeight, { id });
        syncPadQueryAabb(pad, options.halfWidth, options.halfHeight);
    } else {
        const radius = options.radius ?? def.circleRadius;
        pad = createCircleFloorShape(x, y, radius, { id });
        syncPadQueryAabb(pad, radius, radius);
    }
    pad.preset = preset;
    pad.powered = options.powered ?? true;
    if (preset === "button") {
        pad.inputMode = options.inputMode ?? DEFAULT_BUTTON_INPUT_MODE;
        pad.massThreshold = options.massThreshold ?? DEFAULT_BUTTON_MASS_THRESHOLD;
        pad.invert = options.invert === true;
        pad._toggleLatched = false;
        pad.buttonLinks = options.buttonLinks?.map((link) => ({ ...link })) ?? [];
    }
    pad.triggers = (options.triggers ?? def.triggers).map((trigger) => ({ ...trigger }));
    return pad;
}
/**
 * @param {object} state
 * @param {string} preset
 * @param {number} x
 * @param {number} y
 * @param {object} [options]
 */
export function spawnSandboxPad(state, preset, x, y, options = {}) {
    const pad = buildSandboxPad(state, preset, x, y, options);
    addPadToState(state, pad);
    return pad;
}
/** @param {object} state @param {number} index */
function removeSandboxPadAt(state, index) {
    removePadFromState(state, state.sandbox.pads[index]);
}
/** @param {object} state @param {string} id */
export function deleteSandboxPad(state, id) {
    const pads = state.sandbox.pads;
    const index = pads.findIndex((pad) => pad.id === id);
    if (index >= 0) removeSandboxPadAt(state, index);
}
/** @param {object} state */
export function clearSandboxPads(state) {
    clearPadsInState(state);
}
/** @param {object} pad */
export function getSandboxPadEditorState(pad) {
    /** @type {Record<string, number | string | null | undefined>} */
    const snapshot = { id: pad.id, preset: pad.preset, label: PAD_PRESETS[pad.preset].listLabel, x: pad.x, y: pad.y };
    if (pad.shape.type === "Circle") snapshot.radius = pad.shape.radius;
    if (pad.preset === "button") {
        snapshot.linkCount = pad.buttonLinks.length;
        snapshot.inputMode = pad.inputMode;
        snapshot.massThreshold = pad.massThreshold;
        snapshot.invert = pad.invert;
    }
    return snapshot;
}
/** @param {object} pad @param {number} radius */
function resizeCirclePad(pad, radius) {
    pad.shape.radius = radius;
    syncPadQueryAabb(pad, radius, radius);
}
/**
 * @param {object} state
 * @param {string} id
 * @param {{
 *   radius?: number,
 *   inputMode?: import("./buttonPad.js").ButtonInputMode,
 *   massThreshold?: number,
 *   invert?: boolean,
 *   x?: number,
 *   y?: number,
 * }} patch
 */
export function patchSandboxPad(state, id, patch) {
    const pad = state.entityRegistry.get(id);
    if (!pad || getSandboxEntityMeta(state).getAssemblyGroupId(pad.id)) return false;
    if (patch.x != null || patch.y != null) {
        if (patch.x != null) pad.x = patch.x;
        if (patch.y != null) pad.y = patch.y;
        if (pad.shape.type === "Circle") resizeCirclePad(pad, pad.shape.radius);
    }
    if (pad.preset === "button") {
        if (patch.radius != null) resizeCirclePad(pad, patch.radius);
        if (patch.inputMode != null) {
            pad.inputMode = patch.inputMode;
            pad._toggleLatched = false;
            pad._massWasActive = false;
            pad._buttonWasActive = false;
        }
        if (patch.massThreshold != null) pad.massThreshold = patch.massThreshold;
        if (patch.invert != null) pad.invert = patch.invert;
    }
    return true;
}
/** @param {object} state */
export function listSandboxPads(state) {
    const counts = {};
    return state.sandbox.pads
        .filter((pad) => !getSandboxEntityMeta(state).getAssemblyGroupId(pad.id))
        .map((pad) => {
            counts[pad.preset] = (counts[pad.preset] ?? 0) + 1;
            const n = counts[pad.preset];
            const entry = { id: pad.id, preset: pad.preset, label: `${PAD_PRESETS[pad.preset].listLabel} #${n}` };
            const snapshot = getSandboxPadEditorState(pad);
            if (snapshot.radius != null) entry.radius = snapshot.radius;
            if (snapshot.linkCount != null) entry.linkCount = snapshot.linkCount;
            if (snapshot.inputMode != null) entry.inputMode = snapshot.inputMode;
            return entry;
        });
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {boolean} pressed @param {number} radius */
function drawPadButton(ctx, x, y, pressed, radius) {
    const lineScale = getCanvasLineScale(ctx);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pressed ? 0.88 : 1, pressed ? 0.88 : 1);
    const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
    grad.addColorStop(0, pressed ? "#FFAB91" : "#FF7043");
    grad.addColorStop(1, pressed ? "#BF360C" : "#E64A19");
    ctx.fillStyle = grad;
    fillCircle(ctx, 0, 0, radius);
    ctx.strokeStyle = "#3E2723";
    ctx.lineWidth = 2.5 * lineScale;
    strokeCircle(ctx, 0, 0, radius);
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    fillCircle(ctx, -radius * 0.28, -radius * 0.28, radius * 0.32);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.5 * lineScale;
    strokeCircle(ctx, 0, 0, radius * 0.55);
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {object} pad @param {import("../../Viewport/Viewport.js").Viewport} viewport @param {object} state */
export function drawPad(ctx, pad, viewport, state) {
    if (pad.preset === "button") {
        drawPadButton(ctx, pad.x, pad.y, isButtonPadActive(state, pad), pad.shape.radius);
        return;
    }
    drawFloorShape(ctx, pad);
}
/** @param {object} state @param {object} pad */
function tickButtonPad(state, pad) {
    if (pad.inputMode === "massToggle") {
        const massActive = buttonPadMass(state, pad) > pad.massThreshold;
        const wasMassActive = pad._massWasActive ?? false;
        if (massActive && !wasMassActive) pad._toggleLatched = !pad._toggleLatched;
        pad._massWasActive = massActive;
    }
    if (isSustainedFlipperButtonInputMode(pad.inputMode)) syncButtonFlipperLinks(state, pad);
    tickButtonSpawnerLinks(state, pad);
    if (isToggleInputMode(pad.inputMode)) return;
    const active = isButtonPadActive(state, pad);
    const wasActive = pad._buttonWasActive ?? false;
    if (pad.inputMode === "massTap" && active && !wasActive) runButtonPadEffects(state, pad);
    pad._buttonWasActive = active;
}
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame @param {number} dt */
export function tickSandboxPads(state, spatialFrame, dt) {
    const pads = state.sandbox.pads;
    const dtSec = dt / 1000;
    if (pads.length) {
        processFloorShapes(spatialFrame, pads, {
            onEnter(pad, entity) {
                if (!pad.powered) return;
                runPadTriggers(state, pad, "enter", { entity });
            },
            onExit(pad, entityId) {
                if (!pad.powered) return;
                runPadTriggers(state, pad, "exit", { entityId });
            },
        });
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (pad.preset === "button") tickButtonPad(state, pad);
        }
    }
    syncSandboxPadPower(state);
    if (!pads.length) return;
    for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad.preset === "button" || !pad.powered) continue;
        runPadTriggers(state, pad, padHasOccupant(state, pad) ? "occupied" : "empty", { dtSec });
    }
}
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const sandboxPadEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx) {
        const pads = state.sandbox.pads;
        if (!pads.length) return;
        ctx.save();
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (!isAabbInView(pad, viewport)) continue;
            drawPad(ctx, pad, viewport, state);
        }
        ctx.restore();
    },
};
