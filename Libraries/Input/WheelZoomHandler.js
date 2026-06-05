/**
 * @param {Element} element
 * @param {(delta: number) => void} onZoomDelta
 * @param {{ sensitivity?: number }} [options]
 */
export function bindWheelZoom(element, onZoomDelta, { sensitivity = 1 } = {}) {
    element.addEventListener(
        "wheel",
        (e) => {
            e.preventDefault();
            onZoomDelta(e.deltaY * sensitivity);
        },
        { passive: false },
    );
}
