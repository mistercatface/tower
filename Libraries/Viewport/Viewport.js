import { aabbOverlap, centerHalfExtentsAabbInto, circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import { LIBRARY_MIN_WORLD_SPAN } from "../Spatial/iso/perspectiveDefaults.js";
/** Default prop/entity cull padding (world px). */
export const VIEW_BOUNDS_PROPS_PAD_PX = 20;
/** @typedef {"clip" | "props" | "structure" | "chunks"} ViewBoundsTier */
/** 2D world camera: pan, zoom, and screen/world coordinate transforms. */
export class Viewport {
    constructor(x, y, zoom = 1.0) {
        this._x = x;
        this._y = y;
        this._zoom = zoom;
        this.cx = 0;
        this.cy = 0;
        this.width = 0;
        this.height = 0;
        this.halfW = 0;
        this.halfH = 0;
        this.invZoom = 1;
        this.viewQueryPadPx = 0;
        this.viewPaddingPx = 0;
        this._boundsClip = createAabb();
        this._boundsProps = createAabb();
        this._boundsStructure = createAabb();
        this._boundsChunks = createAabb();
        this.structurePerspectiveWorldSpan = LIBRARY_MIN_WORLD_SPAN;
        this.structurePerspectiveReferenceSpan = LIBRARY_MIN_WORLD_SPAN;
        this.structurePerspectiveStrength = undefined;
        this._structurePerspectiveConfigGen = undefined;
        Object.defineProperty(this, "x", { get: () => this._x, set: (v) => this._setPosition(v, this._y) });
        Object.defineProperty(this, "y", { get: () => this._y, set: (v) => this._setPosition(this._x, v) });
        Object.defineProperty(this, "zoom", { get: () => this._zoom, set: (v) => this._setZoom(v) });
    }
    configureDrawBounds(viewQueryPadPx, viewPaddingPx) {
        if (this.viewQueryPadPx === viewQueryPadPx && this.viewPaddingPx === viewPaddingPx) return;
        this.viewQueryPadPx = viewQueryPadPx;
        this.viewPaddingPx = viewPaddingPx;
        this._recompute();
    }
    _setZoom(zoom) {
        this._zoom = zoom;
        this._recompute();
    }
    _setPosition(x, y) {
        this._x = x;
        this._y = y;
        this._recompute();
    }
    _recompute() {
        const w = this.width > 0 ? this.width : this.cx * 2;
        const h = this.height > 0 ? this.height : this.cy * 2;
        this.halfW = w / (2 * this._zoom);
        this.halfH = h / (2 * this._zoom);
        this.invZoom = 1 / this._zoom;
        centerHalfExtentsAabbInto(this._boundsClip, this._x, this._y, this.halfW, this.halfH, 0);
        centerHalfExtentsAabbInto(this._boundsProps, this._x, this._y, this.halfW, this.halfH, VIEW_BOUNDS_PROPS_PAD_PX);
        centerHalfExtentsAabbInto(this._boundsStructure, this._x, this._y, this.halfW, this.halfH, this.viewQueryPadPx);
        centerHalfExtentsAabbInto(this._boundsChunks, this._x, this._y, this.halfW, this.halfH, this.viewPaddingPx);
        this.structurePerspectiveWorldSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, Math.min(this.halfW, this.halfH) * 2);
        this.structurePerspectiveReferenceSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, this.getVisualRadius() * 2);
        this.structurePerspectiveStrength = undefined;
    }
    bounds(tier) {
        if (tier === "clip") return this._boundsClip;
        if (tier === "props") return this._boundsProps;
        if (tier === "structure") return this._boundsStructure;
        if (tier === "chunks") return this._boundsChunks;
        throw new Error(`unknown view bounds tier: ${tier}`);
    }
    circleInBounds(worldX, worldY, radius = 0, tier = "props") {
        return circleIntersectsAabb(worldX, worldY, radius, this.bounds(tier));
    }
    aabbInBounds(aabb, tier = "clip") {
        return aabbOverlap(aabb, this.bounds(tier));
    }
    apply(ctx) {
        ctx.translate(this.cx, this.cy);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }
    screenToWorld(screenX, screenY) {
        return { x: (screenX - this.cx) * this.invZoom + this.x, y: (screenY - this.cy) * this.invZoom + this.y };
    }
    worldToScreen(worldX, worldY) {
        return { x: (worldX - this.x) * this.zoom + this.cx, y: (worldY - this.y) * this.zoom + this.cy };
    }
    follow(targetX, targetY, factor = 0.1) {
        this._setPosition(this._x + (targetX - this._x) * factor, this._y + (targetY - this._y) * factor);
    }
    snapTo(x, y) {
        this._setPosition(x, y);
    }
    setCanvasSize(width, height) {
        this.width = width;
        this.height = height;
        this.cx = width / 2;
        this.cy = height / 2;
        this._recompute();
    }
    getVisualRadius() {
        return Math.max(1, Math.min(this.cx, this.cy) - 4);
    }
    isVisible(worldX, worldY, radius = 0, tier = "props") {
        return this.circleInBounds(worldX, worldY, radius, tier);
    }
}
