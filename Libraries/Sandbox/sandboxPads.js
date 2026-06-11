import { createCircleFloorShape, createRectFloorShape, drawFloorShape, isAabbInView, processFloorShapes } from "../Spatial/zones/floorShapes.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { drawPit, syncSinkPadAabb } from "../Spatial/zones/pit.js";
import { NEIGHBOR_QUERY_PAD } from "../Spatial/collision/entityBroadphase.js";
import { PAD_PRESETS } from "./padPresets.js";
import { drawGateWall, isPadTriggerActive, runPadEffect, setupGatePad, teardownGatePad } from "./padEffects.js";
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
/** @param {object} state @param {object} pad */
function isPadButtonPressed(state, pad) {
    return isPadTriggerActive(state, pad, pad.triggers, "pointerDown") || pad._pointerHeld;
}
/** @param {object} state @param {object} pad @param {import("./padPresets.js").PadWhen} when @param {import("./padEffects.js").PadEffectContext} ctx */
function runPadTriggers(state, pad, when, ctx) {
    for (let i = 0; i < pad.triggers.length; i++) {
        const trigger = pad.triggers[i];
        if (trigger.when === when) runPadEffect(state, pad, trigger, ctx);
    }
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
/** @param {object} pad @param {number} halfWidth @param {number} halfHeight */
function syncRectPadAabb(pad, halfWidth, halfHeight) {
    const margin = NEIGHBOR_QUERY_PAD;
    pad.aabb = { minX: pad.x - halfWidth - margin, minY: pad.y - halfHeight - margin, maxX: pad.x + halfWidth + margin, maxY: pad.y + halfHeight + margin };
}
/** @param {object} state @param {number} wx @param {number} wy */
export function hitTestPad(state, wx, wy) {
    const pads = state.sandboxPads;
    for (let i = pads.length - 1; i >= 0; i--) if (pointInPad(pads[i], wx, wy)) return pads[i];
    return null;
}
/** @param {object} state @param {object} pad @param {{ x: number, y: number }} world */
export function handlePadPointerDown(state, pad, world) {
    for (let i = 0; i < pad.triggers.length; i++) {
        if (pad.triggers[i].when !== "pointerDown") continue;
        pad._pointerHeld = true;
        runPadTriggers(state, pad, "pointerDown", { world });
        return true;
    }
    return false;
}
/**
 * @param {object} state
 * @param {string} preset
 * @param {number} x
 * @param {number} y
 * @param {{ id?: string, radius?: number, sinkDepth?: number, halfWidth?: number, halfHeight?: number, forceX?: number, forceY?: number, targetPickupId?: number, triggers?: object[] }} [options]
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
        syncRectPadAabb(pad, halfWidth, halfHeight);
    } else if (options.halfWidth != null && options.halfHeight != null) {
        pad = createRectFloorShape(x, y, options.halfWidth, options.halfHeight, { id });
        syncRectPadAabb(pad, options.halfWidth, options.halfHeight);
    } else {
        const radius = options.radius ?? def.circleRadius;
        pad = createCircleFloorShape(x, y, radius, { id });
        if (preset === "sink") syncSinkPadAabb(pad, radius);
        else {
            const margin = NEIGHBOR_QUERY_PAD;
            pad.aabb = { minX: x - radius - margin, minY: y - radius - margin, maxX: x + radius + margin, maxY: y + radius + margin };
        }
    }
    pad.preset = preset;
    pad.sinkDepth = options.sinkDepth ?? def.sinkDepth;
    if (options.targetPickupId != null) pad.targetPickupId = options.targetPickupId;
    pad.triggers = (options.triggers ?? def.triggers).map((trigger) => ({ ...trigger }));
    if (preset === "pull") {
        if (options.forceX != null) pad.triggers[0].forceX = options.forceX;
        if (options.forceY != null) pad.triggers[0].forceY = options.forceY;
    }
    if (def.linkedWalls) setupGatePad(state, pad);
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
    teardownGatePad(state, pad);
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
    syncRectPadAabb(pad, halfWidth, halfHeight);
}
/** @param {object} pad */
function readPullHalfExtents(pad) {
    if (pad.shape.type === "Polygon") return { halfWidth: Math.abs(pad.shape.vertices[0].x), halfHeight: Math.abs(pad.shape.vertices[0].y) };
    const def = PAD_PRESETS.pull;
    return { halfWidth: def.halfWidth, halfHeight: def.halfHeight };
}
/** @param {object} pad */
export function getSandboxPadEditorState(pad) {
    /** @type {Record<string, number | string | null | undefined>} */
    const snapshot = { id: pad.id, preset: pad.preset, label: PAD_PRESETS[pad.preset].listLabel };
    if (pad.shape.type === "Circle") snapshot.radius = pad.shape.radius;
    if (pad.preset === "sink") snapshot.sinkDepth = pad.sinkDepth;
    if (pad.preset === "pull") {
        const { halfWidth, halfHeight } = readPullHalfExtents(pad);
        snapshot.halfWidth = halfWidth;
        snapshot.halfHeight = halfHeight;
        const trigger = pad.triggers[0];
        snapshot.forceX = trigger.forceX;
        snapshot.forceY = trigger.forceY;
    }
    if (pad.preset === "button") snapshot.targetPickupId = pad.targetPickupId ?? null;
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
    syncRectPadAabb(pad, halfWidth, halfHeight);
}
/** @param {object} pad @param {number} radius @param {string} preset */
function resizeCirclePad(pad, radius, preset) {
    pad.shape.radius = radius;
    if (preset === "sink") syncSinkPadAabb(pad, radius);
    else {
        const margin = NEIGHBOR_QUERY_PAD;
        pad.aabb = { minX: pad.x - radius - margin, minY: pad.y - radius - margin, maxX: pad.x + radius + margin, maxY: pad.y + radius + margin };
    }
}
/**
 * @param {object} state
 * @param {string} id
 * @param {{
 *   radius?: number,
 *   sinkDepth?: number,
 *   halfWidth?: number,
 *   halfHeight?: number,
 *   forceX?: number,
 *   forceY?: number,
 *   targetPickupId?: number | null,
 * }} patch
 */
export function patchSandboxPad(state, id, patch) {
    const pad = getSandboxPad(state, id);
    if (!pad || pad.sandboxGroupId) return false;
    if (pad.preset === "sink") {
        if (patch.radius != null) resizeCirclePad(pad, patch.radius, pad.preset);
        if (patch.sinkDepth != null) pad.sinkDepth = patch.sinkDepth;
    } else if (pad.preset === "gate") {
        if (patch.radius != null) resizeCirclePad(pad, patch.radius, pad.preset);
    } else if (pad.preset === "pull") {
        const current = readPullHalfExtents(pad);
        const halfWidth = patch.halfWidth ?? current.halfWidth;
        const halfHeight = patch.halfHeight ?? current.halfHeight;
        if (patch.halfWidth != null || patch.halfHeight != null || pad.shape.type !== "Polygon") ensurePullRectShape(pad, halfWidth, halfHeight);
        const trigger = pad.triggers[0];
        if (patch.forceX != null) trigger.forceX = patch.forceX;
        if (patch.forceY != null) trigger.forceY = patch.forceY;
    } else if (pad.preset === "button") {
        if (patch.radius != null) resizeCirclePad(pad, patch.radius, pad.preset);
        if (patch.targetPickupId !== undefined) pad.targetPickupId = patch.targetPickupId;
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
            if (snapshot.targetPickupId != null) entry.targetPickupId = snapshot.targetPickupId;
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
        drawPit(ctx, pad, viewport.x, viewport.y);
        return;
    }
    if (style === "plate") {
        drawFloorShape(ctx, pad, { fill: "rgba(76, 175, 80, 0.35)", stroke: "rgba(27, 94, 32, 0.9)", lineWidth: 2 });
        if (pad.wallsUp) for (let w = 0; w < pad.walls.length; w++) drawGateWall(ctx, pad.walls[w]);
        return;
    }
    if (style === "pull") {
        drawFloorShape(ctx, pad, { fill: "rgba(255, 100, 100, 0.22)", stroke: "rgba(255, 80, 80, 0.9)", lineWidth: 2 });
        return;
    }
    if (style === "button") {
        drawPadButton(ctx, pad.x, pad.y, isPadButtonPressed(state, pad), pad.shape.radius);
        return;
    }
    drawFloorShape(ctx, pad);
}
/** @param {object} state */
function tickPadPointerRelease(state) {
    for (let i = 0; i < state.sandboxPads.length; i++) {
        const pad = state.sandboxPads[i];
        if (pad.preset !== "button") continue;
        if (!isPadButtonPressed(state, pad)) pad._pointerHeld = false;
    }
}
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame @param {number} dt */
export function tickSandboxPads(state, spatialFrame, dt) {
    const pads = state.sandboxPads;
    if (!pads.length) return;
    const dtSec = dt / 1000;
    processFloorShapes(spatialFrame, pads, {
        onEnter(pad, entity) {
            runPadTriggers(state, pad, "enter", { entity });
        },
        onExit(pad, entityId) {
            runPadTriggers(state, pad, "exit", { entityId });
        },
    });
    for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        runPadTriggers(state, pad, padHasOccupant(state, pad) ? "occupied" : "empty", { dtSec });
    }
    tickPadPointerRelease(state);
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
