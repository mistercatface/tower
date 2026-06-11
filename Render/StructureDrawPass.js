import { WORLD_RENDER_MODE_FLAT2D } from "./WorldRenderMode.js";
/**
 * @typedef {object} StructureDrawPass
 * @property {(ctx: CanvasRenderingContext2D, state: object, viewport: import("../Libraries/Viewport/Viewport.js").Viewport) => void} draw
 */
/** @param {import("./Render.js").Renderer} renderer @returns {StructureDrawPass} */
export function createRadialStructurePass(renderer) {
    return {
        draw(ctx, state, viewport) {
            renderer.render3D.draw3DBuildings(ctx, renderer.worldSceneDrawInput, viewport, state.walls);
            state.worldSurfaces.drawRoofs(ctx, state, viewport);
        },
    };
}
/** @param {import("./Render.js").Renderer} renderer @returns {StructureDrawPass} */
export function createFlat2dStructurePass(renderer) {
    return {
        draw(ctx, state, viewport) {
            state.worldSurfaces.drawFlatWallRails(ctx, state, viewport);
            renderer.render3D.draw3DBuildings(ctx, renderer.worldSceneDrawInput, viewport, state.walls, { skipWalls: true });
        },
    };
}
/** @param {import("./WorldRenderMode.js").WorldRenderMode} mode @param {import("./Render.js").Renderer} renderer @returns {StructureDrawPass} */
export function createStructureDrawPass(mode, renderer) {
    return mode === WORLD_RENDER_MODE_FLAT2D ? createFlat2dStructurePass(renderer) : createRadialStructurePass(renderer);
}
