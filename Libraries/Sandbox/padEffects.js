import { Segment } from "../../Entities/Wall.js";
import { CAPTURED_SINK_DURATION_MS } from "../../Entities/worldPropVoidSinkState.js";
import { createAabb } from "../Math/Aabb2D.js";
import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { canEntityFitVoidPit, isInsideVoidMouth, isVoidSinkCaptured } from "../Spatial/zones/pit.js";
import { padStampBoundsInto, readRectPadHalfExtents } from "../Spatial/zones/floorShapes.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { releaseFlipper, triggerFlipper } from "./behaviors/flipperBehavior.js";
import { getButtonPadLinks } from "./sandboxPadLinks.js";
import { addSandboxWalls, removeSandboxWalls } from "./spawnAssembly.js";
import { buttonEffectiveActive, isSustainedFlipperButtonInputMode, isSustainedSpawnerButtonInputMode } from "./buttonPad.js";
import { fireSpawner, isSpawnerWorldProp } from "./spawnerConfig.js";
/** @typedef {import("./padPresets.js").PadTriggerDef} PadTriggerDef */
const padStampScratch = createAabb();
/**
 * @typedef {object} PadEffectContext
 * @property {object} [entity]
 * @property {number} [entityId]
 * @property {number} [dtSec]
 * @property {{ x: number, y: number }} [world]
 */
/** @param {object} state @param {object} pad */
function buildPullPadWalls(state, pad) {
    const { halfWidth, halfHeight } = readRectPadHalfExtents(pad);
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const stamp = padStampBoundsInto(padStampScratch, pad, halfWidth, halfHeight);
    const originX = grid.minX;
    const originY = grid.minY;
    const halfCell = cellSize * 0.5;
    /** @type {import("../../Entities/Wall.js").Segment[]} */
    const walls = [];
    forEachObstacleGridCellInAabb(grid, stamp, (col, row) => {
        const wall = new Segment(originX + col * cellSize + halfCell, originY + row * cellSize + halfCell, 0, cellSize, 0, 30, 30, false, cellSize);
        wall.collisionOnly = true;
        wall.sandboxPadId = pad.id;
        walls.push(wall);
    });
    return walls;
}
/** @param {object} state */
function rebuildPullPadNavigation(state) {
    state.hierarchicalNavigator.rebuildRegions(state.viewport.x, state.viewport.y);
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
    const pads = state.sandbox.pads;
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
/** @param {object} prop @param {object} pad */
function beginSink(prop, pad) {
    if (prop.isDead || prop.currentStateName === "voidSink") return;
    if (!canEntityFitVoidPit(pad.shape.radius, prop)) return;
    prop.voidX = pad.x;
    prop.voidY = pad.y;
    prop.voidRadius = pad.shape.radius;
    prop.voidDepth = pad.sinkDepth;
    prop.voidCaptureTolerance = pad.captureTolerance;
    prop.voidCaptured = isVoidSinkCaptured(pad.x, pad.y, pad.shape.radius, prop, pad.captureTolerance);
    if (prop.voidCaptured) prop.voidSinkTimer = CAPTURED_SINK_DURATION_MS;
    else delete prop.voidSinkTimer;
    prop.changeState("voidSink");
}
/** @param {object} state @param {number} entityId @param {object} pad */
function rimOutSink(state, entityId, pad) {
    const prop = state.entityRegistry.get(entityId);
    if (!prop || prop.currentStateName !== "voidSink" || prop.voidCaptured) return;
    if (isInsideVoidMouth(pad.x, pad.y, pad.shape.radius, prop)) return;
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
