import { floorShapeHasLiveOccupant } from "../Props/props.js";
import { processFloorShapes } from "../Spatial/spatial.js";
import { tickFloorButtons } from "./floorButtons.js";
import { runFloorEffect } from "./floorEffects.js";
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame @param {number} dt */
export function tickFloorProps(state, spatialFrame, dt) {
    tickFloorButtons(state, spatialFrame);
    /** @type {object[]} */
    const shapes = [];
    const worldProps = state.worldProps;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead || !prop.triggers?.length) continue;
        shapes.push(prop);
    }
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
        runFloorTriggers(state, prop, floorShapeHasLiveOccupant(state.entityRegistry, prop) ? "occupied" : "empty", { dtSec });
    }
}
/** @param {object} state @param {object} prop @param {import("./floorEffects.js").FloorTriggerWhen} when @param {import("./floorEffects.js").FloorEffectContext} ctx */
function runFloorTriggers(state, prop, when, ctx) {
    for (let i = 0; i < prop.triggers.length; i++) {
        const trigger = prop.triggers[i];
        if (trigger.when === when) runFloorEffect(state, prop, trigger, ctx);
    }
}
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const floorPropEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx, renderer) {
        renderer.render3D.drawFloorProps(ctx, state, viewport);
    },
};
