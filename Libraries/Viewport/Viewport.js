import { aabbOverlap, centerHalfExtentsAabbInto, circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import { LIBRARY_MIN_WORLD_SPAN } from "../Spatial/iso/perspectiveDefaults.js";
/** Default entity cull padding (px in world space). */
export const VIEWPORT_VISIBILITY_PAD_DEFAULT = 20;
/** Loose visibility tier — cached for callers that need extra margin beyond clip. */
export const VIEWPORT_VISIBILITY_PAD_WIDE = 128;
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
        this.boundsClip = createAabb();
        this.boundsQuery = createAabb();
        this.boundsDraw = createAabb();
        this.boundsVisibleDefault = createAabb();
        this.boundsVisibleWide = createAabb();
        this.structurePerspectiveWorldSpan = LIBRARY_MIN_WORLD_SPAN;
        this.structurePerspectiveReferenceSpan = LIBRARY_MIN_WORLD_SPAN;
        /** @type {number | undefined} Lazily filled by resolveStructurePerspectiveStrength. */
        this.structurePerspectiveStrength = undefined;
        /** @type {number | undefined} */
        this._structurePerspectiveConfigGen = undefined;
        Object.defineProperty(this, "x", { get: () => this._x, set: (v) => this._setPosition(v, this._y) });
        Object.defineProperty(this, "y", { get: () => this._y, set: (v) => this._setPosition(this._x, v) });
        Object.defineProperty(this, "zoom", { get: () => this._zoom, set: (v) => this._setZoom(v) });
    }
    /** @param {number} viewQueryPadPx @param {number} viewPaddingPx */
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
        centerHalfExtentsAabbInto(this.boundsClip, this._x, this._y, this.halfW, this.halfH, 0);
        centerHalfExtentsAabbInto(this.boundsQuery, this._x, this._y, this.halfW, this.halfH, this.viewQueryPadPx);
        centerHalfExtentsAabbInto(this.boundsDraw, this._x, this._y, this.halfW, this.halfH, this.viewPaddingPx);
        centerHalfExtentsAabbInto(this.boundsVisibleDefault, this._x, this._y, this.halfW, this.halfH, VIEWPORT_VISIBILITY_PAD_DEFAULT);
        centerHalfExtentsAabbInto(this.boundsVisibleWide, this._x, this._y, this.halfW, this.halfH, VIEWPORT_VISIBILITY_PAD_WIDE);
        this.structurePerspectiveWorldSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, Math.min(this.halfW, this.halfH) * 2);
        this.structurePerspectiveReferenceSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, this.getVisualRadius() * 2);
        this.structurePerspectiveStrength = undefined;
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
    isVisible(worldX, worldY, radius = 0, padding = VIEWPORT_VISIBILITY_PAD_DEFAULT) {
        if (padding === VIEWPORT_VISIBILITY_PAD_DEFAULT) return circleIntersectsAabb(worldX, worldY, radius, this.boundsVisibleDefault);
        if (padding === VIEWPORT_VISIBILITY_PAD_WIDE) return circleIntersectsAabb(worldX, worldY, radius, this.boundsVisibleWide);
        return circleIntersectsAabb(worldX, worldY, radius + padding, this.boundsClip);
    }
    /** @param {import("../Math/Aabb2D.js").Aabb2D} aabb @param {number} [padding] */
    intersectsAabb(aabb, padding = 0) {
        if (padding === 0) return aabbOverlap(aabb, this.boundsClip);
        const hw = this.halfW + padding;
        const hh = this.halfH + padding;
        return aabb.minX <= this.x + hw && aabb.maxX >= this.x - hw && aabb.minY <= this.y + hh && aabb.maxY >= this.y - hh;
    }
}
