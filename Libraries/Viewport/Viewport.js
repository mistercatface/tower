/** 2D world camera: pan, zoom, and screen/world coordinate transforms. */
export class Viewport {
    constructor(x, y, zoom = 1.0) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
        this.cx = 0;
        this.cy = 0;
        this.width = 0;
        this.height = 0;
        /** World-space half extents of the visible rect (from cx/cy and zoom). */
        this.halfW = 0;
        this.halfH = 0;
        this.invZoom = 1;
        this._derivedZoom = NaN;
        this._derivedCx = NaN;
        this._derivedCy = NaN;
        /** Per-frame world AABBs — set by {@link beginFrame}. */
        this.boundsClip = null;
        this.boundsQuery = null;
        this.boundsDraw = null;
    }
    _syncDerived() {
        if (this._derivedZoom === this.zoom && this._derivedCx === this.cx && this._derivedCy === this.cy) return;
        this.halfW = this.cx / this.zoom;
        this.halfH = this.cy / this.zoom;
        this.invZoom = 1 / this.zoom;
        this._derivedZoom = this.zoom;
        this._derivedCx = this.cx;
        this._derivedCy = this.cy;
    }
    _resolveCanvasSize(width, height) {
        return { width: width ?? (this.width > 0 ? this.width : this.cx * 2), height: height ?? (this.height > 0 ? this.height : this.cy * 2) };
    }
    _worldHalfExtents(width, height) {
        this._syncDerived();
        const size = this._resolveCanvasSize(width, height);
        return { halfW: size.width / (2 * this.zoom), halfH: size.height / (2 * this.zoom) };
    }
    _worldBoundsFromHalfExtents(halfW, halfH, padding = 0) {
        return { minX: this.x - halfW - padding, minY: this.y - halfH - padding, maxX: this.x + halfW + padding, maxY: this.y + halfH + padding };
    }
    /**
     * Cache padded world bounds for the current frame. Call once before draw/sim cull passes.
     *
     * @param {{ width?: number, height?: number, viewQueryPadPx?: number, viewPaddingPx?: number }} [options]
     */
    beginFrame({ width, height, viewQueryPadPx, viewPaddingPx } = {}) {
        this._syncDerived();
        const { halfW, halfH } = this._worldHalfExtents(width, height);
        this.boundsClip = this._worldBoundsFromHalfExtents(halfW, halfH, 0);
        this.boundsQuery = viewQueryPadPx != null ? this._worldBoundsFromHalfExtents(halfW, halfH, viewQueryPadPx) : null;
        this.boundsDraw = viewPaddingPx != null ? this._worldBoundsFromHalfExtents(halfW, halfH, viewPaddingPx) : null;
    }
    apply(ctx) {
        ctx.translate(this.cx, this.cy);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }
    screenToWorld(screenX, screenY) {
        this._syncDerived();
        return { x: (screenX - this.cx) * this.invZoom + this.x, y: (screenY - this.cy) * this.invZoom + this.y };
    }
    worldToScreen(worldX, worldY) {
        this._syncDerived();
        return { x: (worldX - this.x) * this.zoom + this.cx, y: (worldY - this.y) * this.zoom + this.cy };
    }
    follow(targetX, targetY, factor = 0.1) {
        this.x += (targetX - this.x) * factor;
        this.y += (targetY - this.y) * factor;
    }
    snapTo(x, y) {
        this.x = x;
        this.y = y;
    }
    /** Set screen-space center from canvas dimensions (call on resize). */
    setCanvasSize(width, height) {
        this.width = width;
        this.height = height;
        this.cx = width / 2;
        this.cy = height / 2;
    }
    getVisualRadius() {
        return Math.max(1, Math.min(this.cx, this.cy) - 4);
    }
    isVisible(worldX, worldY, radius = 0, padding = 20) {
        this._syncDerived();
        const limit = radius + padding;
        return worldX >= this.x - this.halfW - limit && worldX <= this.x + this.halfW + limit && worldY >= this.y - this.halfH - limit && worldY <= this.y + this.halfH + limit;
    }
    /** World AABB overlap test against the visible rect (e.g. line segments). */
    intersectsWorldAabb(minX, maxX, minY, maxY, padding = 0) {
        this._syncDerived();
        const hw = this.halfW + padding;
        const hh = this.halfH + padding;
        return minX <= this.x + hw && maxX >= this.x - hw && minY <= this.y + hh && maxY >= this.y - hh;
    }
    getWorldBounds(padding = 0) {
        const { halfW, halfH } = this._worldHalfExtents();
        return this._worldBoundsFromHalfExtents(halfW, halfH, padding);
    }
}
