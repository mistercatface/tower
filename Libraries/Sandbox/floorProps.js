import { processFloorShapes } from "../Spatial/zones/floorShapes.js";
import { runPadEffect } from "./padEffects.js";
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame @param {number} dt */
export function tickFloorProps(state, spatialFrame, dt) {
    /** @type {object[]} */
    const shapes = [];
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !prop.triggers?.length) return;
        shapes.push(prop);
    });
    if (!shapes.length) return;
    const dtSec = dt / 1000;
    processFloorShapes(spatialFrame, shapes, {
        onEnter(shape, entity) {
            if (!shape.powered) return;
            runFloorTriggers(state, shape, "enter", { entity });
        },
        onExit(shape, entityId) {
            if (!shape.powered) return;
            runFloorTriggers(state, shape, "exit", { entityId });
        },
    });
    for (let i = 0; i < shapes.length; i++) {
        const prop = shapes[i];
        if (!prop.powered) continue;
        runFloorTriggers(state, prop, floorPropHasOccupant(state, prop) ? "occupied" : "empty", { dtSec });
    }
}
/** @param {object} state @param {object} prop */
function floorPropHasOccupant(state, prop) {
    for (const entityId of prop._occupants) {
        const entity = state.entityRegistry.get(entityId);
        if (entity && !entity.isDead) return true;
    }
    return false;
}
/** @param {object} state @param {object} prop @param {import("./padPresets.js").PadWhen} when @param {import("./padEffects.js").PadEffectContext} ctx */
function runFloorTriggers(state, prop, when, ctx) {
    for (let i = 0; i < prop.triggers.length; i++) {
        const trigger = prop.triggers[i];
        if (trigger.when === when) runPadEffect(state, prop, trigger, ctx);
    }
}
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const floorPropEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx, renderer) {
        renderer.render3D.drawFloorProps(ctx, renderer.worldSceneDrawInput, viewport);
    },
};
