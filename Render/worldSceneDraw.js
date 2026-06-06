import { isWorldScene } from "../GameState/GamePhase.js";
import { LIBRARY_WORLD_SURFACE_DEFAULTS } from "../Libraries/WorldSurface/worldSurfaceDefaults.js";
import { buildWorldRenderInput } from "./adapters/WorldRenderAdapter.js";
/** @typedef {'ground' | 'buildings' | 'roofs' | 'bloom'} WorldSceneDrawPhase */
/**
 * Shared simulation/lab world draw: ground → wall faces → roof caps → optional bloom.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   state: object,
 *   viewport: import("../Libraries/Viewport/Viewport.js").Viewport,
 *   worldSceneRenderer: import("../Libraries/Render/WorldSceneRenderer.js").WorldSceneRenderer,
 *   canvas?: HTMLCanvasElement,
 *   worldRenderInput?: import("../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput,
 *   phases?: WorldSceneDrawPhase[],
 * }} options
 */
export function drawWorldScene(ctx, options) {
    const { state, viewport, worldSceneRenderer, canvas, worldRenderInput = buildWorldRenderInput(state, viewport), phases = ["ground", "buildings", "roofs", "bloom"] } = options;
    if (!viewport || !isWorldScene(state.phase)) return;
    if (phases.includes("ground") && state.obstacleGrid?.cols) state.worldSurfaces.drawGround(ctx, state, viewport);
    if (phases.includes("buildings")) worldSceneRenderer.draw3DBuildings(ctx, worldRenderInput, viewport);
    if (phases.includes("roofs") && state.obstacleGrid?.cols) state.worldSurfaces.drawRoofs(ctx, state, viewport);
    if (phases.includes("bloom") && canvas && LIBRARY_WORLD_SURFACE_DEFAULTS.bloom?.enabled) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${LIBRARY_WORLD_SURFACE_DEFAULTS.bloom.blur}px)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
    }
}
