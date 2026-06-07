import { Viewport } from "../Libraries/Viewport/Viewport.js";
import { isWorldScene } from "../Core/GamePorts.js";
export function getSimulationZoomRangeFromVisualRadius(visualRadius, outerFit, innerFit) {
    const radius = Math.max(1, visualRadius);
    const minZoom = radius / Math.max(1, outerFit);
    const maxZoom = radius / Math.max(1, innerFit);
    return { minZoom, maxZoom, visualRadius: radius };
}
export function getSimulationZoomRange(viewWidth, viewHeight, outerFit, innerFit) {
    const visualRadius = Math.max(1, Math.min(viewWidth, viewHeight) / 2 - 4);
    return getSimulationZoomRangeFromVisualRadius(visualRadius, outerFit, innerFit);
}
export function getDefaultSimulationZoom(viewWidth, viewHeight, outerFit, innerFit) {
    const { minZoom, maxZoom } = getSimulationZoomRange(viewWidth, viewHeight, outerFit, innerFit);
    return maxZoom <= minZoom ? minZoom : minZoom;
}
export class SimulationViewport extends Viewport {
    constructor(x, y, zoom = 1.0) {
        super(x, y, zoom);
        this.zoomProgress = 0.0;
        this.mapZoom = 1.0;
    }
    updateZoomLimits(state, outerFit, innerFit) {
        if (state && isWorldScene(state.phase)) {
            if (outerFit == null || innerFit == null) return;
            const { minZoom, maxZoom } = getSimulationZoomRangeFromVisualRadius(this.getVisualRadius(), outerFit, innerFit);
            if (maxZoom <= minZoom) this.zoom = minZoom;
            else this.zoom = minZoom + this.zoomProgress * (maxZoom - minZoom);
        } else this.zoom = this.mapZoom;
    }
    setZoom(value, state, outerFit, innerFit) {
        if (state && isWorldScene(state.phase)) {
            if (outerFit == null || innerFit == null) return;
            const { minZoom, maxZoom } = getSimulationZoomRangeFromVisualRadius(this.getVisualRadius(), outerFit, innerFit);
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
