import { isWorldScene } from "../Core/GamePorts.js";
import { LIBRARY_WORLD_SURFACE_DEFAULTS } from "../Libraries/WorldSurface/worldSurfaceDefaults.js";
import { buildWorldRenderInput } from "./adapters/WorldRenderAdapter.js";
/**
 * @typedef {object} WorldSceneDrawContext
 * @property {object} state
 * @property {import("../Libraries/Viewport/Viewport.js").Viewport} viewport
 * @property {import("../Libraries/Render/WorldSceneRenderer.js").WorldSceneRenderer} worldSceneRenderer
 * @property {import("../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput} worldRenderInput
 * @property {HTMLCanvasElement} [canvas]
 */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Omit<WorldSceneDrawContext, "worldRenderInput"> & { worldRenderInput?: WorldSceneDrawContext["worldRenderInput"] }} options
 * @returns {WorldSceneDrawContext | null}
 */
function resolveWorldSceneDraw(options) {
    const { state, viewport, worldSceneRenderer, canvas, worldRenderInput = buildWorldRenderInput(state, viewport) } = options;
    if (!viewport || !isWorldScene(state.phase)) return null;
    return { state, viewport, worldSceneRenderer, worldRenderInput, canvas };
}
/** Ground tiles and debris props — zIndex -5 pass. */
export function drawWorldSceneBackdrop(ctx, options) {
    const draw = resolveWorldSceneDraw(options);
    if (!draw) return;
    const { state, viewport, worldSceneRenderer, worldRenderInput } = draw;
    if (state.obstacleGrid?.cols) state.worldSurfaces.drawGround(ctx, state, viewport);
    worldSceneRenderer.drawDebrisProps(ctx, worldRenderInput, viewport);
}
/** Walls, roofs, and optional bloom — zIndex 70 pass. */
export function drawWorldSceneStructure(ctx, options) {
    const draw = resolveWorldSceneDraw(options);
    if (!draw) return;
    const { state, viewport, worldSceneRenderer, worldRenderInput, canvas } = draw;
    worldSceneRenderer.draw3DBuildings(ctx, worldRenderInput, viewport);
    if (state.obstacleGrid?.cols) state.worldSurfaces.drawRoofs(ctx, state, viewport);
    if (canvas && LIBRARY_WORLD_SURFACE_DEFAULTS.bloom?.enabled) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${LIBRARY_WORLD_SURFACE_DEFAULTS.bloom.blur}px)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
    }
}
