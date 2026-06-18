import { drawVectorProp, resolveVectorPropPresentation } from "./vectorProp.js";

/** @param {CanvasRenderingContext2D} ctx @param {object} prop @param {WorldPropDrawContext} drawContext */
export function drawDefaultWorldProp(ctx, prop, drawContext) {
    const { propRenderer, px, py, zoom = 1 } = drawContext;
    propRenderer.drawProp(ctx, prop, px, py, { zoom });
}

/**
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
