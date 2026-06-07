import { getActiveGameDefinition } from "../Core/ActiveGameDefinition.js";
import { isWorldScene } from "../Core/GamePorts.js";
import { createLiveWorldStructure } from "../Libraries/Render/worldStructure/LiveWorldStructure.js";
import { LIBRARY_WORLD_SURFACE_DEFAULTS } from "../Libraries/WorldSurface/worldSurfaceDefaults.js";
import { buildWorldRenderInput } from "./adapters/WorldRenderAdapter.js";
/** @typedef {'ground' | 'buildings' | 'roofs' | 'bloom'} WorldSceneDrawPhase */
const defaultWorldStructure = createLiveWorldStructure();
/** @param {import("../Libraries/Render/worldStructure/LiveWorldStructure.js").WorldStructurePort | undefined} override */
function resolveWorldStructure(override) {
    return override ?? getActiveGameDefinition()?.render?.worldStructure ?? defaultWorldStructure;
}
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
 *   worldStructure?: import("../Libraries/Render/worldStructure/LiveWorldStructure.js").WorldStructurePort,
 *   phases?: WorldSceneDrawPhase[],
 * }} options
 */
export function drawWorldScene(ctx, options) {
    const { state, viewport, worldSceneRenderer, canvas, worldRenderInput = buildWorldRenderInput(state, viewport), worldStructure, phases = ["ground", "buildings", "roofs", "bloom"] } = options;
    if (!viewport || !isWorldScene(state.phase)) return;
    if (phases.includes("ground") && state.obstacleGrid?.cols) state.worldSurfaces.drawGround(ctx, state, viewport);
    const structureCtx = { state, viewport, worldRenderInput, worldSceneRenderer, phases: { drawBuildings: phases.includes("buildings"), drawRoofs: phases.includes("roofs") } };
    const structurePort = resolveWorldStructure(worldStructure);
    if (structureCtx.phases.drawBuildings || structureCtx.phases.drawRoofs) structurePort.drawStructure(ctx, structureCtx);
    if (structureCtx.phases.drawBuildings) structurePort.drawDynamicProps(ctx, structureCtx);
    if (phases.includes("bloom") && canvas && LIBRARY_WORLD_SURFACE_DEFAULTS.bloom?.enabled) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${LIBRARY_WORLD_SURFACE_DEFAULTS.bloom.blur}px)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
    }
}
