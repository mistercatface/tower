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
        return {
            x: (screenX - this.cx) / this.zoom + this.x,
            y: (screenY - this.cy) / this.zoom + this.y
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.x) * this.zoom + this.cx,
            y: (worldY - this.y) * this.zoom + this.cy
        };
    }

    follow(targetX, targetY, factor = 0.1) {
        this.x += (targetX - this.x) * factor;
        this.y += (targetY - this.y) * factor;
    }

    snapTo(x, y) {
        this.x = x;
        this.y = y;
    }

    setZoom(value) {
        this.zoom = Math.min(Math.max(value, 0.2), 3.0);
    }
}