/**
 * @param {Element} element
 * @param {(delta: number) => void} onZoomDelta
 * @param {{ sensitivity?: number }} [options]
 * @returns {() => void}
 */
export function bindWheelZoom(element, onZoomDelta, { sensitivity = 1 } = {}) {
    const handler = (e) => {
        e.preventDefault();
        onZoomDelta(e.deltaY * sensitivity);
    };
    element.addEventListener("wheel", handler, { passive: false });
    return () => element.removeEventListener("wheel", handler);
}
