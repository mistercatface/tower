import { renderActorKinematicsBody } from "./Characters/actorKinematicsRenderer.js";
import { drawVectorProp, resolveVectorPropPresentation } from "./vectorProp.js";
/**
 * @typedef {object} WorldPropDrawContext
 * @property {object} [gameState]
 * @property {import("./Props3D/PropRenderer.js").PropRenderer} propRenderer
 * @property {number} px
 * @property {number} py
 * @property {number} [zoom]
 */
/** @param {CanvasRenderingContext2D} ctx @param {object} prop @param {WorldPropDrawContext} drawContext */
export function drawDefaultWorldProp(ctx, prop, drawContext) {
    const { propRenderer, px, py, zoom = 1 } = drawContext;
    if (prop.usesKinematicsBody) {
        renderActorKinematicsBody(ctx, prop, { x: px, y: py });
        return;
    }
    propRenderer.drawProp(ctx, prop, px, py, { zoom });
}
/**
 * Single entry point for world prop presentation — vector or default iso/kinematics draw.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {WorldPropDrawContext} drawContext
 */
export function drawWorldProp(ctx, prop, viewport, drawContext) {
    const spec = resolveVectorPropPresentation(prop, drawContext.gameState);
    if (spec) {
        drawVectorProp(ctx, prop, spec, { gameState: drawContext.gameState, camera: viewport });
        return;
    }
    drawDefaultWorldProp(ctx, prop, drawContext);
}
