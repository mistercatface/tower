import { isWorldScene } from "../Core/GamePorts.js";
import { LIBRARY_WORLD_SURFACE_DEFAULTS } from "../Libraries/WorldSurface/worldSurfaceDefaults.js";
/**
 * @typedef {object} WorldSceneDrawContext
 * @property {object} state
 * @property {import("../Libraries/Viewport/Viewport.js").Viewport} viewport
 * @property {import("../Libraries/Render/WorldSceneRenderer.js").WorldSceneRenderer} worldSceneRenderer
 * @property {import("../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput} worldRenderInput
 */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Omit<WorldSceneDrawContext, "worldRenderInput"> & { worldRenderInput?: WorldSceneDrawContext["worldRenderInput"] }} options
 * @returns {WorldSceneDrawContext | null}
 */
function resolveWorldSceneDraw(options) {
    const { state, viewport, worldSceneRenderer, worldRenderInput } = options;
    if (!viewport || !isWorldScene(state.phase)) return null;
    return { state, viewport, worldSceneRenderer, worldRenderInput };
}
/** Ground tiles and debris props — zIndex -5 pass. */
export function drawWorldSceneBackdrop(ctx, options) {
    const draw = resolveWorldSceneDraw(options);
    if (!draw) return;
    const { state, viewport, worldSceneRenderer, worldRenderInput } = draw;
    state.worldSurfaces.drawGround(ctx, state, viewport);
    worldSceneRenderer.drawDebrisProps(ctx, worldRenderInput, viewport);
}
/** Walls and roofs — zIndex 70 pass. */
export function drawWorldSceneStructure(ctx, options) {
    const draw = resolveWorldSceneDraw(options);
    if (!draw) return;
    const { state, viewport, worldSceneRenderer, worldRenderInput } = draw;
    worldSceneRenderer.draw3DBuildings(ctx, worldRenderInput, viewport);
    state.worldSurfaces.drawRoofs(ctx, state, viewport);
}
/** Full-canvas bloom — register as a pipeline pass when enabled, not per-frame config probing. */
export function drawWorldSceneBloom(ctx, canvas) {
    if (!canvas) return;
    const { blur } = LIBRARY_WORLD_SURFACE_DEFAULTS.bloom;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "screen";
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
}
