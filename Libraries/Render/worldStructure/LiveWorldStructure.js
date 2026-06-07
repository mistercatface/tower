/** @typedef {import("../WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/**
 * @typedef {object} WorldStructureDrawContext
 * @property {object} state
 * @property {import("../../Viewport/Viewport.js").Viewport} viewport
 * @property {WorldSceneDrawInput} worldRenderInput
 * @property {import("../WorldSceneRenderer.js").WorldSceneRenderer} worldSceneRenderer
 * @property {{ drawBuildings: boolean, drawRoofs: boolean }} phases
 */
/**
 * @typedef {object} WorldStructurePort
 * @property {(ctx: CanvasRenderingContext2D, drawCtx: WorldStructureDrawContext) => void} drawStructure
 * @property {(ctx: CanvasRenderingContext2D, drawCtx: WorldStructureDrawContext) => void} drawDynamicProps
 * @property {(reason: string) => void} invalidate
 */
/** Default structure draw — interleaved walls + 3D props, then roofs. */
export class LiveWorldStructure {
    /** @param {CanvasRenderingContext2D} ctx @param {WorldStructureDrawContext} drawCtx */
    drawStructure(ctx, drawCtx) {
        const { state, viewport, worldRenderInput, worldSceneRenderer, phases } = drawCtx;
        if (phases.drawBuildings) worldSceneRenderer.draw3DBuildings(ctx, worldRenderInput, viewport);
        if (phases.drawRoofs && state.obstacleGrid?.cols) state.worldSurfaces.drawRoofs(ctx, state, viewport);
    }
    /** @param {CanvasRenderingContext2D} _ctx @param {WorldStructureDrawContext} _drawCtx */
    drawDynamicProps(_ctx, _drawCtx) {}
    /** @param {string} _reason */
    invalidate(_reason) {}
}
/** @returns {WorldStructurePort} */
export function createLiveWorldStructure() {
    return new LiveWorldStructure();
}
