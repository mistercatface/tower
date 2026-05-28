export class Viewport {
    constructor(x, y, zoom = 1.0) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
        this.zoomProgress = 0.0;
        this.mapZoom = 1.0;
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

    getVisualRadius() {
        return Math.max(1, Math.min(this.cx, this.cy) - 15);
    }

    updateZoomLimits(state) {
        if (state && (state.phase === "combat" || state.phase === "reward" || state.phase === "map_transition")) {
            const baseRange = 150;
            const currentRange = state.player.weapon.range;
            const visualRadius = this.getVisualRadius();
            const minZoom = visualRadius / Math.max(1, currentRange);
            const maxZoom = visualRadius / baseRange;
            
            if (maxZoom <= minZoom) {
                this.zoom = minZoom;
            } else {
                this.zoom = minZoom + this.zoomProgress * (maxZoom - minZoom);
            }
        } else {
            this.zoom = this.mapZoom;
        }
    }

    setZoom(value, state) {
        if (state && (state.phase === "combat" || state.phase === "reward" || state.phase === "map_transition")) {
            const baseRange = 150;
            const currentRange = state.player.weapon.range;
            const visualRadius = this.getVisualRadius();
            const minZoom = visualRadius / Math.max(1, currentRange);
            const maxZoom = visualRadius / baseRange;
            
            if (maxZoom <= minZoom) {
                this.zoom = minZoom;
                this.zoomProgress = 0.0;
            } else {
                const clampedValue = Math.min(Math.max(value, minZoom), maxZoom);
                this.zoom = clampedValue;
                this.zoomProgress = (clampedValue - minZoom) / (maxZoom - minZoom);
            }
        } else {
            this.mapZoom = Math.min(Math.max(value, 0.5), 2.0);
            this.zoom = this.mapZoom;
        }
    }
}