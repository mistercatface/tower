import { createCircleFloorShape, createRectFloorShape, drawFloorShape, isAabbInView, processFloorShapes, syncPadQueryAabb } from "../Spatial/zones/floorShapes.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { drawPitInterior } from "../Spatial/zones/pit.js";
import { PAD_PRESETS } from "./padPresets.js";
import { runPadEffect, syncButtonFlipperLinks, syncPullPadWalls, syncSandboxPadPower, teardownPullPad, tickButtonSpawnerLinks } from "./padEffects.js";
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
        const pickup = state.pickups.find((entry) => entry.id === entityId);
        if (pickup && !pickup.isDead) return true;
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
    const pads = state.sandboxPads;
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
    for (let i = 0; i < state.sandboxPads.length; i++) {
        const pad = state.sandboxPads[i];
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
 *   sinkDepth?: number,
 *   captureTolerance?: number,
 *   halfWidth?: number,
 *   halfHeight?: number,
 *   forceX?: number,
 *   forceY?: number,
 *   buttonLinks?: import("./sandboxPadLinks.js").ButtonLinkTarget[],
 *   inputMode?: import("./buttonPad.js").ButtonInputMode,
 *   massThreshold?: number,
 *   invert?: boolean,
 *   wallMode?: boolean,
 *   triggers?: object[],
 * }} [options]
 */
export function buildSandboxPad(state, preset, x, y, options = {}) {
    const def = PAD_PRESETS[preset];
    if (!def) throw new Error(`Unknown pad preset "${preset}"`);
    const id = options.id ?? `${preset}:${state.sandboxPads.length + 1}`;
    /** @type {object} */
    let pad;
    if (preset === "pull") {
        const defHalfWidth = def.halfWidth;
        const defHalfHeight = def.halfHeight;
        const halfWidth = options.halfWidth ?? defHalfWidth;
        const halfHeight = options.halfHeight ?? defHalfHeight;
        pad = createRectFloorShape(x, y, halfWidth, halfHeight, { id });
        syncPadQueryAabb(pad, halfWidth, halfHeight);
    } else if (options.halfWidth != null && options.halfHeight != null) {
        pad = createRectFloorShape(x, y, options.halfWidth, options.halfHeight, { id });
        syncPadQueryAabb(pad, options.halfWidth, options.halfHeight);
    } else {
        const radius = options.radius ?? def.circleRadius;
        pad = createCircleFloorShape(x, y, radius, { id });
        syncPadQueryAabb(pad, radius, radius);
    }
    pad.preset = preset;
    pad.powered = options.powered ?? true;
    pad.sinkDepth = options.sinkDepth ?? def.sinkDepth;
    if (options.captureTolerance != null) pad.captureTolerance = options.captureTolerance;
    if (preset === "button") {
        pad.inputMode = options.inputMode ?? DEFAULT_BUTTON_INPUT_MODE;
        pad.massThreshold = options.massThreshold ?? DEFAULT_BUTTON_MASS_THRESHOLD;
        pad.invert = options.invert === true;
        pad._toggleLatched = false;
        pad.buttonLinks = options.buttonLinks?.map((link) => ({ ...link })) ?? [];
    }
    if (preset === "pull") {
        pad.wallMode = options.wallMode === true;
        pad.walls = [];
        pad.wallsUp = false;
        if (pad.wallMode) syncPullPadWalls(state, pad);
    }
    pad.triggers = (options.triggers ?? def.triggers).map((trigger) => ({ ...trigger }));
    if (preset === "pull") {
        if (options.forceX != null) pad.triggers[0].forceX = options.forceX;
        if (options.forceY != null) pad.triggers[0].forceY = options.forceY;
    }
    return pad;
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {string} preset
 * @param {number} x
 * @param {number} y
 * @param {object} [options]
 */
export function spawnSandboxPad(host, preset, x, y, options = {}) {
    const state = host.getWorldState();
    const pad = buildSandboxPad(state, preset, x, y, options);
    state.sandboxPads.push(pad);
    return pad;
}
/** @param {object} state @param {number} index */
function removeSandboxPadAt(state, index) {
    const pad = state.sandboxPads[index];
    if (pad.preset === "pull") teardownPullPad(state, pad);
    state.sandboxPads.splice(index, 1);
}
/** @param {object} state @param {string} id */
export function deleteSandboxPad(state, id) {
    const pads = state.sandboxPads;
    const index = pads.findIndex((pad) => pad.id === id);
    if (index >= 0) removeSandboxPadAt(state, index);
}
/** @param {object} state */
export function clearSandboxPads(state) {
    for (let i = state.sandboxPads.length - 1; i >= 0; i--) removeSandboxPadAt(state, i);
}
/** @param {object} state @param {string} id */
export function getSandboxPad(state, id) {
    return state.sandboxPads.find((pad) => pad.id === id) ?? null;
}
/** @param {object} pad @param {number} halfWidth @param {number} halfHeight */
function ensurePullRectShape(pad, halfWidth, halfHeight) {
    if (pad.shape.type === "Polygon") {
        resizeRectPad(pad, halfWidth, halfHeight);
        return;
    }
    pad.shape = new PolygonShape([
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
    ]);
    syncPadQueryAabb(pad, halfWidth, halfHeight);
}
/** @param {object} pad */
function readPullHalfExtents(pad) {
    if (pad.shape.type === "Polygon") return { halfWidth: Math.abs(pad.shape.vertices[0].x), halfHeight: Math.abs(pad.shape.vertices[0].y) };
    const def = PAD_PRESETS.pull;
    return { halfWidth: def.halfWidth, halfHeight: def.halfHeight };
}
/** @param {object} state @param {object} pad */
function syncPadPosition(state, pad) {
    if (pad.shape.type === "Circle") resizeCirclePad(pad, pad.shape.radius);
    else if (pad.shape.type === "Polygon") {
        const { halfWidth, halfHeight } = readPullHalfExtents(pad);
        syncPadQueryAabb(pad, halfWidth, halfHeight);
    }
    if (pad.preset === "pull" && pad.wallMode && pad.wallsUp) {
        teardownPullPad(state, pad);
        syncPullPadWalls(state, pad);
    }
}
/** @param {object} pad */
export function getSandboxPadEditorState(pad) {
    /** @type {Record<string, number | string | null | undefined>} */
    const snapshot = { id: pad.id, preset: pad.preset, label: PAD_PRESETS[pad.preset].listLabel, x: pad.x, y: pad.y };
    if (pad.shape.type === "Circle") snapshot.radius = pad.shape.radius;
    if (pad.preset === "sink") {
        snapshot.sinkDepth = pad.sinkDepth;
        snapshot.powered = pad.powered;
    }
    if (pad.preset === "pull") {
        const { halfWidth, halfHeight } = readPullHalfExtents(pad);
        snapshot.halfWidth = halfWidth;
        snapshot.halfHeight = halfHeight;
        const trigger = pad.triggers[0];
        snapshot.forceX = trigger.forceX;
        snapshot.forceY = trigger.forceY;
        snapshot.wallMode = pad.wallMode;
        snapshot.powered = pad.powered;
    }
    if (pad.preset === "button") {
        snapshot.linkCount = pad.buttonLinks.length;
        snapshot.inputMode = pad.inputMode;
        snapshot.massThreshold = pad.massThreshold;
        snapshot.invert = pad.invert;
    }
    return snapshot;
}
/** @param {object} pad @param {number} halfWidth @param {number} halfHeight */
function resizeRectPad(pad, halfWidth, halfHeight) {
    pad.shape.vertices = [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
    ];
    pad.shape.normals = pad.shape._computeNormals();
    pad.shape.boundingRadius = pad.shape._computeBoundingRadius();
    syncPadQueryAabb(pad, halfWidth, halfHeight);
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
 *   sinkDepth?: number,
 *   captureTolerance?: number,
 *   halfWidth?: number,
 *   halfHeight?: number,
 *   forceX?: number,
 *   forceY?: number,
 *   inputMode?: import("./buttonPad.js").ButtonInputMode,
 *   massThreshold?: number,
 *   invert?: boolean,
 *   wallMode?: boolean,
 *   x?: number,
 *   y?: number,
 * }} patch
 */
export function patchSandboxPad(state, id, patch) {
    const pad = getSandboxPad(state, id);
    if (!pad || pad.sandboxGroupId) return false;
    if (patch.x != null || patch.y != null) {
        if (patch.x != null) pad.x = patch.x;
        if (patch.y != null) pad.y = patch.y;
        syncPadPosition(state, pad);
    }
    if (pad.preset === "sink") {
        if (patch.radius != null) resizeCirclePad(pad, patch.radius);
        if (patch.sinkDepth != null) pad.sinkDepth = patch.sinkDepth;
    } else if (pad.preset === "pull") {
        const current = readPullHalfExtents(pad);
        const halfWidth = patch.halfWidth ?? current.halfWidth;
        const halfHeight = patch.halfHeight ?? current.halfHeight;
        if (patch.halfWidth != null || patch.halfHeight != null || pad.shape.type !== "Polygon") ensurePullRectShape(pad, halfWidth, halfHeight);
        const trigger = pad.triggers[0];
        if (patch.forceX != null) trigger.forceX = patch.forceX;
        if (patch.forceY != null) trigger.forceY = patch.forceY;
        if (patch.wallMode != null && patch.wallMode !== pad.wallMode) {
            if (pad.wallMode && pad.wallsUp) teardownPullPad(state, pad);
            pad.wallMode = patch.wallMode;
        }
        if (pad.wallMode && pad.wallsUp && (patch.halfWidth != null || patch.halfHeight != null)) {
            teardownPullPad(state, pad);
            syncPullPadWalls(state, pad);
        } else if (patch.wallMode === true && !pad.wallsUp) syncPullPadWalls(state, pad);
    } else if (pad.preset === "button") {
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
    return state.sandboxPads
        .filter((pad) => !pad.sandboxGroupId)
        .map((pad) => {
            counts[pad.preset] = (counts[pad.preset] ?? 0) + 1;
            const n = counts[pad.preset];
            const entry = { id: pad.id, preset: pad.preset, label: `${PAD_PRESETS[pad.preset].listLabel} #${n}` };
            const snapshot = getSandboxPadEditorState(pad);
            if (snapshot.radius != null) entry.radius = snapshot.radius;
            if (snapshot.sinkDepth != null) entry.sinkDepth = snapshot.sinkDepth;
            if (snapshot.halfWidth != null) {
                entry.halfWidth = snapshot.halfWidth;
                entry.halfHeight = snapshot.halfHeight;
                entry.forceX = snapshot.forceX;
                entry.forceY = snapshot.forceY;
            }
            if (snapshot.linkCount != null) entry.linkCount = snapshot.linkCount;
            if (snapshot.inputMode != null) entry.inputMode = snapshot.inputMode;
            return entry;
        });
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {boolean} pressed @param {number} radius */
function drawPadButton(ctx, x, y, pressed, radius) {
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pressed ? 0.88 : 1, pressed ? 0.88 : 1);
    const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
    grad.addColorStop(0, pressed ? "#FFAB91" : "#FF7043");
    grad.addColorStop(1, pressed ? "#BF360C" : "#E64A19");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3E2723";
    ctx.lineWidth = 2.5 * lineScale;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(-radius * 0.28, -radius * 0.28, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.5 * lineScale;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {object} pad @param {import("../../Viewport/Viewport.js").Viewport} viewport @param {object} state */
export function drawPad(ctx, pad, viewport, state) {
    const style = PAD_PRESETS[pad.preset].draw;
    if (style === "pit") {
        drawPitInterior(ctx, pad, viewport.x, viewport.y);
        return;
    }
    if (style === "pull") {
        const off = pad.powered ? 1 : 0.35;
        drawFloorShape(ctx, pad, { fill: `rgba(255, 100, 100, ${0.22 * off})`, stroke: pad.wallMode && pad.wallsUp ? "rgba(180, 180, 200, 0.95)" : `rgba(255, 80, 80, ${0.9 * off})`, lineWidth: 2 });
        return;
    }
    if (style === "button") {
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
    const pads = state.sandboxPads;
    if (!pads.length) return;
    const dtSec = dt / 1000;
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
    syncSandboxPadPower(state);
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
        const pads = state.sandboxPads;
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
