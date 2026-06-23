/** @param {CanvasRenderingContext2D} ctx @param {object} prop @param {import("../Viewport/Viewport.js").Viewport} viewport @param {WorldPropDrawContext} drawContext */
export function drawWorldProp(ctx, prop, viewport, drawContext) {
    const { propRenderer, px, py, zoom = 1 } = drawContext;
    propRenderer.drawProp(ctx, prop, px, py, { zoom });
}
