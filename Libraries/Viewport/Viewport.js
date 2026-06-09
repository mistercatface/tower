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
        this.boundsClip = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        this.boundsQuery = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        this.boundsDraw = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
        this._writeWorldBounds(this.boundsClip, this.halfW, this.halfH, 0);
        this._writeWorldBounds(this.boundsQuery, this.halfW, this.halfH, this.viewQueryPadPx);
        this._writeWorldBounds(this.boundsDraw, this.halfW, this.halfH, this.viewPaddingPx);
    }
    _writeWorldBounds(out, halfW, halfH, padding) {
        out.minX = this._x - halfW - padding;
        out.minY = this._y - halfH - padding;
        out.maxX = this._x + halfW + padding;
        out.maxY = this._y + halfH + padding;
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
    isVisible(worldX, worldY, radius = 0, padding = 20) {
        const limit = radius + padding;
        return worldX >= this.x - this.halfW - limit && worldX <= this.x + this.halfW + limit && worldY >= this.y - this.halfH - limit && worldY <= this.y + this.halfH + limit;
    }
    intersectsWorldAabb(minX, maxX, minY, maxY, padding = 0) {
        const hw = this.halfW + padding;
        const hh = this.halfH + padding;
        return minX <= this.x + hw && maxX >= this.x - hw && minY <= this.y + hh && maxY >= this.y - hh;
    }
}
