/** @typedef {import("./LiveWorldStructure.js").WorldStructureDrawContext} WorldStructureDrawContext */
/** @typedef {import("./LiveWorldStructure.js").WorldStructurePort} WorldStructurePort */
/**
 * Bakes walls + roofs once per viewport snapshot; dynamic 3D props draw live on top.
 * For fixed-camera games (pool) — tower keeps LiveWorldStructure.
 */
export class CachedWorldStructure {
    constructor() {
        /** @type {OffscreenCanvas | null} */
        this._canvas = null;
        /** @type {string | null} */
        this._key = null;
        this._dirty = true;
    }
    /**
     * @param {import("../../Viewport/Viewport.js").Viewport} viewport
     * @param {number} width
     * @param {number} height
     */
    _snapshotKey(viewport, width, height) {
        return `${viewport.x}|${viewport.y}|${viewport.zoom}|${viewport.cx}|${viewport.cy}|${width}|${height}`;
    }
    /**
     * @param {WorldStructureDrawContext} drawCtx
     * @param {number} width
     * @param {number} height
     */
    _rebake(drawCtx, width, height) {
        const { state, viewport, worldRenderInput, worldSceneRenderer, phases } = drawCtx;
        if (!this._canvas || this._canvas.width !== width || this._canvas.height !== height) this._canvas = new OffscreenCanvas(width, height);
        const bakeCtx = this._canvas.getContext("2d");
        bakeCtx.setTransform(1, 0, 0, 1, 0, 0);
        bakeCtx.clearRect(0, 0, width, height);
        viewport.apply(bakeCtx);
        if (phases.drawBuildings) worldSceneRenderer.drawStructureOnly(bakeCtx, worldRenderInput, viewport);
        if (phases.drawRoofs && state.obstacleGrid?.cols) state.worldSurfaces.drawRoofs(bakeCtx, state, viewport);
        this._key = this._snapshotKey(viewport, width, height);
        this._dirty = false;
    }
    /** @param {CanvasRenderingContext2D} ctx @param {WorldStructureDrawContext} drawCtx */
    drawStructure(ctx, drawCtx) {
        const { viewport, state } = drawCtx;
        const width = state.canvasBounds?.width ?? viewport.cx * 2;
        const height = state.canvasBounds?.height ?? viewport.cy * 2;
        if (width <= 0 || height <= 0) return;
        if (state.worldSurfaces?.hasPendingSurfaceBakes?.()) this._dirty = true;
        const key = this._snapshotKey(viewport, width, height);
        if (this._dirty || key !== this._key) this._rebake(drawCtx, width, height);
        if (!this._canvas) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._canvas, 0, 0);
        ctx.restore();
    }
    /** @param {CanvasRenderingContext2D} ctx @param {WorldStructureDrawContext} drawCtx */
    drawDynamicProps(ctx, drawCtx) {
        if (!drawCtx.phases.drawBuildings) return;
        drawCtx.worldSceneRenderer.drawDynamicPropsOnly(ctx, drawCtx.worldRenderInput, drawCtx.viewport);
    }
    /** @param {string} _reason */
    invalidate(_reason) {
        this._dirty = true;
    }
}
/** @returns {WorldStructurePort} */
export function createCachedWorldStructure() {
    return new CachedWorldStructure();
}
