/**
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, (e: PointerEvent) => void>} handlers
 * @returns {() => void}
 */
export function bindCanvasPointers(canvas, handlers) {
    /** @type {(() => void)[]} */
    const unbind = [];
    for (const [type, handler] of Object.entries(handlers)) {
        canvas.addEventListener(type, handler, true);
        unbind.push(() => canvas.removeEventListener(type, handler, true));
    }
    return () => {
        while (unbind.length) unbind.pop()?.();
    };
}
/**
 * @param {HTMLCanvasElement | null | undefined} canvas
 * @param {PointerEvent} e
 */
export function releasePointerCapture(canvas, e) {
    if (!canvas?.hasPointerCapture?.(e.pointerId)) return;
    try {
        canvas.releasePointerCapture(e.pointerId);
    } catch {
        // ignore
    }
}
