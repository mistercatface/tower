import { WORLD_RENDER_MODE_FLAT2D } from "./WorldRenderMode.js";
import { drawDamagedVoxelRoofOverlays } from "../Libraries/Render/Structure3D/wallDamageDraw.js";
import { elevationCameraFromViewportInto } from "../Libraries/Spatial/iso/ElevationCamera.js";
const sStructureRoofCamera = { viewerX: 0, viewerY: 0, cameraHeight: 0, strength: 0 };
/**
 * @typedef {object} StructureDrawPass
 * @property {(ctx: CanvasRenderingContext2D, state: object, viewport: import("../Libraries/Viewport/Viewport.js").Viewport) => void} draw
 */
/** @param {import("./Render.js").Renderer} renderer @returns {StructureDrawPass} */
export function createRadialStructurePass(renderer) {
    return {
        draw(ctx, state, viewport) {
            renderer.render3D.draw3DBuildings(ctx, renderer.worldSceneDrawInput, viewport);
            state.worldSurfaces.drawRoofs(ctx, state, viewport);
            elevationCameraFromViewportInto(sStructureRoofCamera, viewport);
            drawDamagedVoxelRoofOverlays(ctx, state, viewport, sStructureRoofCamera);
        },
    };
}
/** @param {import("./Render.js").Renderer} renderer @returns {StructureDrawPass} */
export function createFlat2dStructurePass(renderer) {
    return {
        draw(ctx, state, viewport) {
            state.worldSurfaces.drawFlatWallRails(ctx, state, viewport);
            renderer.render3D.draw3DBuildings(ctx, renderer.worldSceneDrawInput, viewport, { skipWalls: true });
        },
    };
}
/** @param {import("./WorldRenderMode.js").WorldRenderMode} mode @param {import("./Render.js").Renderer} renderer @returns {StructureDrawPass} */
export function createStructureDrawPass(mode, renderer) {
    return mode === WORLD_RENDER_MODE_FLAT2D ? createFlat2dStructurePass(renderer) : createRadialStructurePass(renderer);
}
