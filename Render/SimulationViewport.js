import { Viewport } from "../Libraries/Viewport/Viewport.js";
import { isWorldScene } from "../GameState/GamePhase.js";
import { playerBaseStats } from "../Config/Config.js";
/** Weapon range at max zoom-out in simulation scenes (matches player baseline range). */
export const SIMULATION_BASE_RANGE = playerBaseStats.range;
/**
 * Simulation-scene zoom bounds from viewport half-size and weapon range.
 * @param {number} visualRadius — typically min(cx, cy) - 4
 * @param {number} weaponRange
 */
export function getSimulationZoomRangeFromVisualRadius(visualRadius, weaponRange) {
    const radius = Math.max(1, visualRadius);
    const minZoom = radius / Math.max(1, weaponRange);
    const maxZoom = radius / SIMULATION_BASE_RANGE;
    return { minZoom, maxZoom, visualRadius: radius };
}
/** Simulation-scene zoom bounds from full canvas dimensions (lab preview, layout before Viewport exists). */
export function getSimulationZoomRange(viewWidth, viewHeight, weaponRange) {
    const visualRadius = Math.max(1, Math.min(viewWidth, viewHeight) / 2 - 4);
    return getSimulationZoomRangeFromVisualRadius(visualRadius, weaponRange);
}
/** Default simulation zoom — weapon range fills the view (min zoom when range > base). */
export function getDefaultSimulationZoom(viewWidth, viewHeight, weaponRange) {
    const { minZoom, maxZoom } = getSimulationZoomRange(viewWidth, viewHeight, weaponRange);
    return maxZoom <= minZoom ? minZoom : minZoom;
}
/** Game viewport with simulation/map zoom policy layered on the portable camera. */
export class SimulationViewport extends Viewport {
    constructor(x, y, zoom = 1.0) {
        super(x, y, zoom);
        this.zoomProgress = 0.0;
        this.mapZoom = 1.0;
    }
    updateZoomLimits(state) {
        if (state && isWorldScene(state.phase)) {
            const currentRange = state.player.weapon.range;
            const { minZoom, maxZoom } = getSimulationZoomRangeFromVisualRadius(this.getVisualRadius(), currentRange);
            if (maxZoom <= minZoom) this.zoom = minZoom;
            else this.zoom = minZoom + this.zoomProgress * (maxZoom - minZoom);
        } else this.zoom = this.mapZoom;
    }
    setZoom(value, state) {
        if (state && isWorldScene(state.phase)) {
            const currentRange = state.player.weapon.range;
            const { minZoom, maxZoom } = getSimulationZoomRangeFromVisualRadius(this.getVisualRadius(), currentRange);
            if (maxZoom <= minZoom) {
                this.zoom = minZoom;
                this.zoomProgress = 0.0;
            } else {
                const clampedValue = Math.min(Math.max(value, minZoom), maxZoom);
                this.zoom = clampedValue;
                this.zoomProgress = (clampedValue - minZoom) / (maxZoom - minZoom);
            }
        } else {
            this.mapZoom = Math.min(Math.max(value, 0.1), 2.0);
            this.zoom = this.mapZoom;
        }
    }
}
