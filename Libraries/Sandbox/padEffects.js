import { Segment } from "../../Entities/Wall.js";
import { CAPTURED_SINK_DURATION_MS } from "../../Entities/pickupVoidSinkState.js";
import { isInsideVoidMouth, isVoidSinkCaptured } from "../Spatial/zones/pit.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { releaseFlipper, triggerFlipper } from "./behaviors/flipperBehavior.js";
import { getButtonPadLinks } from "./sandboxPadLinks.js";
import { addSandboxWalls, removeSandboxWalls } from "./spawnAssembly.js";
import { buttonEffectiveActive, isSustainedFlipperButtonInputMode } from "./buttonPad.js";
import { fireSpawner, isSpawnerPickup } from "./spawnerConfig.js";
/** @typedef {import("./padPresets.js").PadTriggerDef} PadTriggerDef */
/**
 * @typedef {object} PadEffectContext
 * @property {object} [entity]
 * @property {number} [entityId]
 * @property {number} [dtSec]
 * @property {{ x: number, y: number }} [world]
 */
/** @param {object} pad */
function readPullHalfExtents(pad) {
    const verts = pad.shape.vertices;
    return { halfWidth: Math.abs(verts[0].x), halfHeight: Math.abs(verts[0].y) };
}
/** @param {object} grid @param {object} pad @param {number} halfWidth @param {number} halfHeight */
function collectPadWallCells(grid, pad, halfWidth, halfHeight) {
    const cellSize = grid.cellSize;
    const padMinX = pad.x - halfWidth;
    const padMinY = pad.y - halfHeight;
    const padMaxX = pad.x + halfWidth;
    const padMaxY = pad.y + halfHeight;
    const startCol = grid.worldToGrid(padMinX, padMinY).col;
    const startRow = grid.worldToGrid(padMinX, padMinY).row;
    const endCol = grid.worldToGrid(padMaxX - 1e-6, padMaxY - 1e-6).col;
    const endRow = grid.worldToGrid(padMaxX - 1e-6, padMaxY - 1e-6).row;
    /** @type {{ col: number, row: number }[]} */
    const cells = [];
    for (let row = startRow; row <= endRow; row++)
        for (let col = startCol; col <= endCol; col++) {
            if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
            const cellMinX = grid.minX + col * cellSize;
            const cellMinY = grid.minY + row * cellSize;
            if (padMaxX <= cellMinX || padMinX >= cellMinX + cellSize || padMaxY <= cellMinY || padMinY >= cellMinY + cellSize) continue;
            cells.push({ col, row });
        }
    return cells;
}
/** @param {object} state @param {object} pad */
function buildPullPadWalls(state, pad) {
    const { halfWidth, halfHeight } = readPullHalfExtents(pad);
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const cells = collectPadWallCells(grid, pad, halfWidth, halfHeight);
    return cells.map(({ col, row }) => {
        const wall = new Segment(grid.minX + col * cellSize + cellSize / 2, grid.minY + row * cellSize + cellSize / 2, 0, cellSize, 0, 30, 30, false, cellSize);
        wall.sandboxPadId = pad.id;
        return wall;
    });
}
/** @param {object} state */
function rebuildPullPadNavigation(state) {
    const seedX = state.viewport?.x ?? 0;
    const seedY = state.viewport?.y ?? 0;
    state.hierarchicalNavigator.rebuildRegions(seedX, seedY);
    state.navigation.onObstaclesChanged(null);
}
/** @param {object} state @param {object} pad @param {boolean} wallsUp */
function setPullPadWalls(state, pad, wallsUp) {
    if (!pad.wallMode || pad.wallsUp === wallsUp) return;
    if (wallsUp) {
        pad.walls = buildPullPadWalls(state, pad);
        addSandboxWalls(state, pad.walls, { notifyNavigation: false });
    } else {
        removeSandboxWalls(state, pad.walls, { notifyNavigation: false });
        pad.walls = [];
    }
    rebuildPullPadNavigation(state);
    pad.wallsUp = wallsUp;
}
/** @param {object} state @param {object} pad */
export function syncPullPadWalls(state, pad) {
    if (pad.preset !== "pull" || !pad.wallMode) return;
    setPullPadWalls(state, pad, pad.powered);
}
/** @param {object} state @param {object} pad */
export function teardownPullPad(state, pad) {
    if (pad.wallsUp) setPullPadWalls(state, pad, false);
}
/** @param {object} state */
export function syncSandboxPadPower(state) {
    /** @type {Map<string, boolean>} */
    const poweredByPadId = new Map();
    const pads = state.sandboxPads;
    for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad.preset !== "button") continue;
        const signal = buttonEffectiveActive(state, pad);
        const links = getButtonPadLinks(pad);
        for (let j = 0; j < links.length; j++) {
            const link = links[j];
            if (link.type !== "pad") continue;
            poweredByPadId.set(link.id, (poweredByPadId.get(link.id) ?? false) || signal);
        }
    }
    for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad.preset === "button") continue;
        const powered = poweredByPadId.has(pad.id) ? poweredByPadId.get(pad.id) : true;
        if (pad.powered === powered) continue;
        pad.powered = powered;
        syncPullPadWalls(state, pad);
    }
}
/** @param {object} pickup @param {object} pad */
function beginSink(pickup, pad) {
    if (pickup.isDead || pickup.currentStateName === "voidSink") return;
    pickup.voidX = pad.x;
    pickup.voidY = pad.y;
    pickup.voidRadius = pad.shape.radius;
    pickup.voidDepth = pad.sinkDepth;
    pickup.voidCaptureTolerance = pad.captureTolerance;
    pickup.voidCaptured = isVoidSinkCaptured(pad.x, pad.y, pad.shape.radius, pickup, pad.captureTolerance);
    if (pickup.voidCaptured) pickup.voidSinkTimer = CAPTURED_SINK_DURATION_MS;
    else delete pickup.voidSinkTimer;
    pickup.changeState("voidSink");
}
/** @param {object} state @param {number} entityId @param {object} pad */
function rimOutSink(state, entityId, pad) {
    const pickup = state.pickups.find((entry) => entry.id === entityId);
    if (!pickup || pickup.currentStateName !== "voidSink" || pickup.voidCaptured) return;
    if (isInsideVoidMouth(pad.x, pad.y, pad.shape.radius, pickup)) return;
    pickup.changeState("normal");
}
/** @param {object} state @param {import("./sandboxPadLinks.js").ButtonLinkPickupTarget} link @param {object} buttonPad */
function runButtonPickupLink(state, link, buttonPad) {
    const pickup = state.pickups.find((entry) => entry.id === link.id && !entry.isDead);
    if (!pickup || isSpawnerPickup(pickup)) return;
    if (isSustainedFlipperButtonInputMode(buttonPad.inputMode)) return;
    if (buttonPad.invert) releaseFlipper(pickup);
    else triggerFlipper(pickup, { hold: false });
}
/** @param {object} state @param {object} buttonPad */
export function tickButtonSpawnerLinks(state, buttonPad) {
    const active = buttonEffectiveActive(state, buttonPad);
    const wasActive = buttonPad._spawnerButtonWasActive ?? false;
    if (active && !wasActive) {
        const links = getButtonPadLinks(buttonPad);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "pickup") continue;
            const pickup = state.pickups.find((entry) => entry.id === link.id && !entry.isDead);
            if (!pickup || !isSpawnerPickup(pickup)) continue;
            fireSpawner(state, pickup);
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
        if (link.type !== "pickup") continue;
        const pickup = state.pickups.find((entry) => entry.id === link.id && !entry.isDead);
        if (!pickup || isSpawnerPickup(pickup)) continue;
        if (active) triggerFlipper(pickup);
        else releaseFlipper(pickup);
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
                const pickup = state.pickups.find((entry) => entry.id === entityId);
                if (!pickup || pickup.isDead || pickup.strategy.gravityImmune) continue;
                wakePushableBody(pickup);
                if (pickup.isSleeping) continue;
                pickup.vx += forceX * dtSec;
                pickup.vy += forceY * dtSec;
            }
        },
    },
    button: {
        run(state, pad) {
            const links = getButtonPadLinks(pad);
            for (let i = 0; i < links.length; i++) {
                const link = links[i];
                if (link.type === "pickup") runButtonPickupLink(state, link, pad);
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
