/** 2D world camera: pan, zoom, and screen/world coordinate transforms. */
export class Viewport {
    constructor(x, y, zoom = 1.0) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
        this.cx = 0;
        this.cy = 0;
    }
    apply(ctx) {
        ctx.translate(this.cx, this.cy);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }
    screenToWorld(screenX, screenY) {
        return { x: (screenX - this.cx) / this.zoom + this.x, y: (screenY - this.cy) / this.zoom + this.y };
    }
    worldToScreen(worldX, worldY) {
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
        this.cx = Math.floor(width / 2);
        this.cy = Math.floor(height / 2);
    }
    getVisualRadius() {
        return Math.max(1, Math.min(this.cx, this.cy) - 4);
    }
    isVisible(worldX, worldY, radius = 0, padding = 20) {
        const halfW = this.cx / this.zoom;
        const halfH = this.cy / this.zoom;
        const limit = radius + padding;
        return worldX >= this.x - halfW - limit && worldX <= this.x + halfW + limit && worldY >= this.y - halfH - limit && worldY <= this.y + halfH + limit;
    }
    getWorldBounds(canvasWidth, canvasHeight, padding = 0) {
        const w = canvasWidth ?? this.cx * 2;
        const h = canvasHeight ?? this.cy * 2;
        const wMin = this.screenToWorld(0, 0);
        const wMax = this.screenToWorld(w, h);
        return { minX: Math.min(wMin.x, wMax.x) - padding, minY: Math.min(wMin.y, wMax.y) - padding, maxX: Math.max(wMin.x, wMax.x) + padding, maxY: Math.max(wMin.y, wMax.y) + padding };
    }
}
