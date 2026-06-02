import { isWorldScene } from "../GameState/GamePhase.js";

/** Weapon range at max zoom-out in combat (matches Config player baseline). */
export const COMBAT_BASE_RANGE = 150;

/**
 * Combat zoom bounds from viewport half-size and weapon range.
 * @param {number} visualRadius — typically min(cx, cy) - 4
 * @param {number} weaponRange
 */
export function getCombatZoomRangeFromVisualRadius(visualRadius, weaponRange) {
    const radius = Math.max(1, visualRadius);
    const minZoom = radius / Math.max(1, weaponRange);
    const maxZoom = radius / COMBAT_BASE_RANGE;
    return { minZoom, maxZoom, visualRadius: radius };
}

/** Combat zoom bounds from full canvas dimensions (lab preview, layout before Viewport exists). */
export function getCombatZoomRange(viewWidth, viewHeight, weaponRange) {
    const visualRadius = Math.max(1, Math.min(viewWidth, viewHeight) / 2 - 4);
    return getCombatZoomRangeFromVisualRadius(visualRadius, weaponRange);
}

/** Default combat zoom — weapon range fills the view (min zoom when range > base). */
export function getDefaultCombatZoom(viewWidth, viewHeight, weaponRange) {
    const { minZoom, maxZoom } = getCombatZoomRange(viewWidth, viewHeight, weaponRange);
    return maxZoom <= minZoom ? minZoom : minZoom;
}

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
        return Math.max(1, Math.min(this.cx, this.cy) - 4);
    }

    updateZoomLimits(state) {
        if (state && isWorldScene(state.phase)) {
            const currentRange = state.player.weapon.range;
            const { minZoom, maxZoom } = getCombatZoomRangeFromVisualRadius(this.getVisualRadius(), currentRange);

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
        if (state && isWorldScene(state.phase)) {
            const currentRange = state.player.weapon.range;
            const { minZoom, maxZoom } = getCombatZoomRangeFromVisualRadius(this.getVisualRadius(), currentRange);

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

    isVisible(worldX, worldY, radius = 0, padding = 20) {
        const halfW = this.cx / this.zoom;
        const halfH = this.cy / this.zoom;
        const limit = radius + padding;
        return (
            worldX >= this.x - halfW - limit &&
            worldX <= this.x + halfW + limit &&
            worldY >= this.y - halfH - limit &&
            worldY <= this.y + halfH + limit
        );
    }

    getWorldBounds(canvasWidth, canvasHeight, padding = 0) {
        const w = canvasWidth ?? this.cx * 2;
        const h = canvasHeight ?? this.cy * 2;
        const wMin = this.screenToWorld(0, 0);
        const wMax = this.screenToWorld(w, h);
        return {
            minX: Math.min(wMin.x, wMax.x) - padding,
            minY: Math.min(wMin.y, wMax.y) - padding,
            maxX: Math.max(wMin.x, wMax.x) + padding,
            maxY: Math.max(wMin.y, wMax.y) + padding,
        };
    }
}