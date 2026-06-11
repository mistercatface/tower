import { Segment } from "../../Entities/Wall.js";
import { createCircleGroundZone, createRectGroundZone, drawGroundZone, isGroundZoneInView, processGroundZones } from "../Spatial/zones/groundZones.js";
import { DEFAULT_VOID_DEPTH, DEFAULT_VOID_RADIUS, drawPit, isInsideVoidMouth, syncSinkPadAabb, voidMouthReach } from "../Spatial/zones/voidZone.js";
import { NEIGHBOR_QUERY_PAD } from "../Spatial/collision/entityBroadphase.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { addSandboxWalls, removeSandboxWall } from "./spawnAssembly.js";
export const SANDBOX_SPAWN_PAD_PREFIX = "pad:";
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
    return isSandboxSpawnPadId(spawnId) ? spawnId.slice(SANDBOX_SPAWN_PAD_PREFIX.length) : null;
}
/** @type {Record<string, { listLabel: string, draw: string, circleRadius?: number, sinkDepth?: number, linkedWalls?: boolean, triggers: object[] }>} */
const PAD_PRESETS = {
    sink: {
        listLabel: "Void pit",
        draw: "pit",
        circleRadius: DEFAULT_VOID_RADIUS,
        sinkDepth: DEFAULT_VOID_DEPTH,
        triggers: [
            { when: "enter", effect: "sink" },
            { when: "exit", effect: "unsink" },
        ],
    },
    gate: {
        listLabel: "Pressure pad",
        draw: "plate",
        circleRadius: 8,
        linkedWalls: true,
        triggers: [
            { when: "occupied", effect: "gate", up: false },
            { when: "empty", effect: "gate", up: true },
        ],
    },
    pull: { listLabel: "Gravity pad", draw: "pull", triggers: [{ when: "occupied", effect: "pull", forceX: 0, forceY: 1000 }] },
};
const GATE_WALL_HEIGHT = 1;
const GATE_WALL_SIZE = 16;
const GATE_WALL_OFFSET_Y = -18;
/** @param {object} state */
function sandboxPads(state) {
    if (!state.sandboxPads) state.sandboxPads = [];
    return state.sandboxPads;
}
/** @param {object} pad @param {number} halfWidth @param {number} halfHeight */
function syncRectPadAabb(pad, halfWidth, halfHeight) {
    const margin = NEIGHBOR_QUERY_PAD;
    pad.aabb = { minX: pad.x - halfWidth - margin, minY: pad.y - halfHeight - margin, maxX: pad.x + halfWidth + margin, maxY: pad.y + halfHeight + margin };
}
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
    if (typeof pickup.getShape !== "function") return;
    pickup.voidX = pad.x;
    pickup.voidY = pad.y;
    pickup.voidRadius = pad.shape.radius;
    pickup.voidDepth = pad.sinkDepth ?? DEFAULT_VOID_DEPTH;
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
/** @param {object} state @param {object} pad */
function padHasOccupant(state, pad) {
    for (const entityId of pad._occupants) {
        const pickup = state.pickups.find((entry) => entry.id === entityId);
        if (pickup && !pickup.isDead) return true;
    }
    return false;
}
/** @param {object} state @param {object} pad @param {object} trigger @param {{ entity?: object, entityId?: number, dtSec?: number }} ctx */
function runPadEffect(state, pad, trigger, ctx) {
    if (trigger.effect === "sink") {
        if (ctx.entity) beginSink(ctx.entity, pad);
        return;
    }
    if (trigger.effect === "unsink") {
        if (ctx.entityId != null) rimOutSink(state, ctx.entityId, pad);
        return;
    }
    if (trigger.effect === "gate") {
        setGateWalls(state, pad, trigger.up === true);
        return;
    }
    if (trigger.effect === "pull") {
        const forceX = trigger.forceX ?? 0;
        const forceY = trigger.forceY ?? 1000;
        if (forceX === 0 && forceY === 0) return;
        const dtSec = ctx.dtSec ?? 0;
        for (const entityId of pad._occupants) {
            const pickup = state.pickups.find((entry) => entry.id === entityId);
            if (!pickup || pickup.isDead || pickup.strategy?.gravityImmune) continue;
            wakePushableBody(pickup);
            if (pickup.isSleeping) continue;
            pickup.vx += forceX * dtSec;
            pickup.vy += forceY * dtSec;
        }
    }
}
/** @param {object} state @param {object} pad @param {"enter" | "exit" | "occupied" | "empty"} when @param {object} ctx */
function runPadTriggers(state, pad, when, ctx) {
    for (let i = 0; i < pad.triggers.length; i++) if (pad.triggers[i].when === when) runPadEffect(state, pad, pad.triggers[i], ctx);
}
/**
 * @param {object} state
 * @param {string} preset
 * @param {number} x
 * @param {number} y
 * @param {{ id?: string, radius?: number, sinkDepth?: number, halfWidth?: number, halfHeight?: number, forceX?: number, forceY?: number, triggers?: object[] }} [options]
 */
export function buildSandboxPad(state, preset, x, y, options = {}) {
    const def = PAD_PRESETS[preset];
    if (!def) return null;
    /** @type {object} */
    let pad;
    if (options.halfWidth != null && options.halfHeight != null) {
        pad = createRectGroundZone(x, y, options.halfWidth, options.halfHeight, { id: options.id ?? `${preset}:${sandboxPads(state).length + 1}` });
        syncRectPadAabb(pad, options.halfWidth, options.halfHeight);
    } else {
        const radius = options.radius ?? def.circleRadius ?? DEFAULT_VOID_RADIUS;
        pad = createCircleGroundZone(x, y, radius, { id: options.id ?? `${preset}:${sandboxPads(state).length + 1}` });
        if (preset === "sink") syncSinkPadAabb(pad, radius);
        else {
            const margin = NEIGHBOR_QUERY_PAD;
            pad.aabb = { minX: x - radius - margin, minY: y - radius - margin, maxX: x + radius + margin, maxY: y + radius + margin };
        }
    }
    pad.preset = preset;
    pad.draw = def.draw;
    pad.sinkDepth = options.sinkDepth ?? def.sinkDepth;
    pad.triggers = (options.triggers ?? def.triggers).map((trigger) => ({ ...trigger }));
    if (preset === "pull" && options.forceX != null) pad.triggers[0].forceX = options.forceX;
    if (preset === "pull" && options.forceY != null) pad.triggers[0].forceY = options.forceY;
    if (def.linkedWalls) {
        pad.wallsUp = true;
        pad.walls = [buildGateWall(x, y, pad.id)];
        addSandboxWalls(state, pad.walls, { compileRender: false });
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
    if (!pad) return null;
    sandboxPads(state).push(pad);
    return pad;
}
/** @param {object} state @param {number} index */
function removeSandboxPadAt(state, index) {
    const pad = sandboxPads(state)[index];
    if (pad.wallsUp) setGateWalls(state, pad, false);
    sandboxPads(state).splice(index, 1);
}
/** @param {object} state @param {string} id */
export function deleteSandboxPad(state, id) {
    const pads = sandboxPads(state);
    const index = pads.findIndex((pad) => pad.id === id);
    if (index >= 0) removeSandboxPadAt(state, index);
}
/** @param {object} state */
export function clearSandboxPads(state) {
    const pads = sandboxPads(state);
    for (let i = pads.length - 1; i >= 0; i--) removeSandboxPadAt(state, i);
}
/** @param {object} state */
export function listSandboxPads(state) {
    const counts = {};
    return sandboxPads(state)
        .filter((pad) => !pad.sandboxGroupId)
        .map((pad) => {
            const preset = pad.preset ?? "pad";
            counts[preset] = (counts[preset] ?? 0) + 1;
            const label = PAD_PRESETS[preset]?.listLabel ?? preset;
            const radius = pad.shape?.radius;
            return { id: pad.id, preset, label: `${label} #${counts[preset]}`, radius };
        });
}
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame @param {number} dt */
export function tickSandboxPads(state, spatialFrame, dt) {
    const pads = sandboxPads(state);
    if (!pads.length) return;
    const dtSec = dt / 1000;
    processGroundZones(spatialFrame, pads, {
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
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../../Entities/Wall.js").Segment} wall */
function drawGateWall(ctx, wall) {
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
/** @param {CanvasRenderingContext2D} ctx @param {object} pad @param {import("../../Viewport/Viewport.js").Viewport} viewport */
function drawSandboxPad(ctx, pad, viewport) {
    if (pad.draw === "pit") {
        drawPit(ctx, pad, viewport.x, viewport.y);
        return;
    }
    if (pad.draw === "plate") {
        drawGroundZone(ctx, pad, { fill: "rgba(76, 175, 80, 0.35)", stroke: "rgba(27, 94, 32, 0.9)", lineWidth: 2 });
        if (pad.wallsUp) for (let w = 0; w < pad.walls.length; w++) drawGateWall(ctx, pad.walls[w]);
        return;
    }
    if (pad.draw === "pull") {
        drawGroundZone(ctx, pad, { fill: "rgba(255, 100, 100, 0.05)", stroke: "rgba(255, 100, 100, 0.2)", lineWidth: 1 });
        return;
    }
    drawGroundZone(ctx, pad);
}
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const sandboxPadEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx) {
        const pads = sandboxPads(state);
        if (!pads.length) return;
        ctx.save();
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (!isGroundZoneInView(pad, viewport)) continue;
            drawSandboxPad(ctx, pad, viewport);
        }
        ctx.restore();
    },
};
