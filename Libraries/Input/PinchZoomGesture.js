function pinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}
/**
 * Two-finger pinch → zoom ratio against touchstart baseline.
 */
export class PinchZoomGesture {
    /**
     * @param {Element} element
     * @param {{ getBaseZoom: () => number, onPinchZoom: (zoom: number) => void }} handlers
     */
    constructor(element, { getBaseZoom, onPinchZoom }) {
        this.element = element;
        this.getBaseZoom = getBaseZoom;
        this.onPinchZoom = onPinchZoom;
        this._initialDistance = null;
        this._initialZoom = 1;
        this._onTouchStart = (e) => {
            if (e.touches.length === 2) {
                this._initialDistance = pinchDistance(e.touches);
                this._initialZoom = getBaseZoom();
            }
        };
        this._onTouchMove = (e) => {
            if (e.touches.length === 2 && this._initialDistance) {
                e.preventDefault();
                const ratio = pinchDistance(e.touches) / this._initialDistance;
                onPinchZoom(this._initialZoom * ratio);
            }
        };
        this._onTouchEnd = (e) => {
            if (e.touches.length < 2) this._initialDistance = null;
        };
        element.addEventListener("touchstart", this._onTouchStart, { passive: false });
        element.addEventListener("touchmove", this._onTouchMove, { passive: false });
        element.addEventListener("touchend", this._onTouchEnd);
    }
    destroy() {
        this.element.removeEventListener("touchstart", this._onTouchStart);
        this.element.removeEventListener("touchmove", this._onTouchMove);
        this.element.removeEventListener("touchend", this._onTouchEnd);
    }
}
