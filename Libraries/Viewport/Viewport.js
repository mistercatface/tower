import { ViewBounds, VIEW_TIER } from "./ViewBounds.js";
const MIN_WORLD_SPAN = 10;
/** 2D world camera: pan, zoom, screen/world mapping, elevation projection knobs. */
export class Viewport {
    constructor(x, y, zoom = 1.0) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
        this.cx = 0;
        this.cy = 0;
        this.width = 0;
        this.height = 0;
        this.halfW = 0;
        this.halfH = 0;
        this.invZoom = 1;
        this.viewBounds = new ViewBounds();
        this._recompute();
    }
    get boundsBuf() {
        return this.viewBounds.buf;
    }
    applyPerspectiveConfig(config) {
        this.cameraHeight = config.cameraHeight;
        this._perspectiveStrengthBase = config.strength;
        this._recompute();
    }
    configureDrawBounds(viewQueryPadPx, viewPaddingPx) {
        if (this.viewBounds.configurePads(viewQueryPadPx, viewPaddingPx)) this._recompute();
    }
    setZoom(zoom) {
        this.zoom = zoom;
        this._recompute();
    }
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this._recompute();
    }
    _recompute() {
        const w = this.width > 0 ? this.width : this.cx * 2;
        const h = this.height > 0 ? this.height : this.cy * 2;
        this.halfW = w / (2 * this.zoom);
        this.halfH = h / (2 * this.zoom);
        this.invZoom = 1 / this.zoom;
        this.viewBounds.recompute(this.x, this.y, this.halfW, this.halfH);
        const worldSpan = Math.max(MIN_WORLD_SPAN, Math.min(this.halfW, this.halfH) * 2);
        const referenceSpan = Math.max(MIN_WORLD_SPAN, this.getVisualRadius() * 2);
        this.perspectiveStrength = (this._perspectiveStrengthBase * referenceSpan) / worldSpan;
    }
    circleInBounds(worldX, worldY, radius = 0, tierO = VIEW_TIER.PROPS) {
        return this.viewBounds.circleInBounds(worldX, worldY, radius, tierO);
    }
    aabbInBounds(buf, o, tierO = VIEW_TIER.CLIP) {
        return this.viewBounds.aabbInBounds(buf, o, tierO);
    }
    apply(ctx) {
        ctx.translate(this.cx, this.cy);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }
    screenToWorldF32(buf, o, screenX, screenY) {
        buf[o] = (screenX - this.cx) * this.invZoom + this.x;
        buf[o + 1] = (screenY - this.cy) * this.invZoom + this.y;
    }
    worldToScreenF32(buf, o, worldX, worldY) {
        buf[o] = (worldX - this.x) * this.zoom + this.cx;
        buf[o + 1] = (worldY - this.y) * this.zoom + this.cy;
    }
    follow(targetX, targetY, factor = 0.1) {
        this.setPosition(this.x + (targetX - this.x) * factor, this.y + (targetY - this.y) * factor);
    }
    snapTo(x, y) {
        this.setPosition(x, y);
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
}
export { VIEW_TIER };
