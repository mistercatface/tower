/** @typedef {import("./WorldSceneRenderer.js").WorldSceneRenderer} WorldSceneRenderer */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/**
 * Draw active explosions with wall-carved blast discs.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
 * @param {WorldSceneRenderer} worldSceneRenderer
 * @param {WorldSceneDrawInput} worldRenderInput
 */
export function renderExplosions(ctx, state, viewport, worldSceneRenderer, worldRenderInput) {
    if (!state.explosions) return;
    for (const exp of state.explosions) {
        if (viewport && !viewport.isVisible(exp.x, exp.y, exp.maxRadius)) continue;
        const canvasSize = exp.maxRadius * 2;
        if (canvasSize <= 0) continue;
        if (!exp.offCanvas) {
            exp.offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
            exp.offCtx = exp.offCanvas.getContext("2d");
        }
        const offCanvas = exp.offCanvas;
        const offCtx = exp.offCtx;
        const cx = exp.maxRadius;
        const cy = exp.maxRadius;
        offCtx.globalCompositeOperation = "source-over";
        offCtx.clearRect(0, 0, canvasSize, canvasSize);
        offCtx.beginPath();
        offCtx.arc(cx, cy, exp.radius, 0, Math.PI * 2);
        if (exp.currentPhase?.brightFill) {
            offCtx.fillStyle = "rgba(244, 67, 54, 0.6)";
            offCtx.fill();
        } else {
            offCtx.fillStyle = "rgba(139, 0, 0, 0.9)";
            offCtx.fill();
        }
        offCtx.globalCompositeOperation = "destination-out";
        offCtx.fillStyle = "#000000";
        offCtx.save();
        offCtx.translate(cx - exp.x, cy - exp.y);
        worldSceneRenderer.drawExplosion(exp.x, exp.y, exp.maxRadius, worldRenderInput, offCtx);
        offCtx.restore();
        ctx.save();
        if (exp.currentPhase?.screenBlend) {
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = 1.0;
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = exp.opacity !== undefined ? exp.opacity : 1.0;
        }
        ctx.drawImage(offCanvas, exp.x - exp.maxRadius, exp.y - exp.maxRadius);
        ctx.restore();
    }
}
/** @returns {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export function createExplosionSimulationEffectPass(zIndex = 60) {
    return {
        zIndex,
        draw(state, viewport, ctx, renderer) {
            renderExplosions(ctx, state, viewport, renderer.render3D, renderer.getWorldRenderInput(state, viewport));
        },
    };
}
