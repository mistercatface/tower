/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 */
export function canvasClientCoords(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
}
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorld: (screenX: number, screenY: number) => { x: number, y: number },
 *   onPointerDown: (world: { x: number, y: number }, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 * @returns {() => void}
 */
export function bindCanvasPointerDown(canvas, { screenToWorld, onPointerDown }) {
    const handler = (e) => {
        const screen = canvasClientCoords(canvas, e.clientX, e.clientY);
        onPointerDown(screenToWorld(screen.x, screen.y), screen, e);
    };
    canvas.addEventListener("pointerdown", handler);
    return () => canvas.removeEventListener("pointerdown", handler);
}
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorld: (screenX: number, screenY: number) => { x: number, y: number },
 *   onPointerMove: (world: { x: number, y: number }, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 * @returns {() => void}
 */
export function bindCanvasPointerMove(canvas, { screenToWorld, onPointerMove }) {
    const handler = (e) => {
        const screen = canvasClientCoords(canvas, e.clientX, e.clientY);
        onPointerMove(screenToWorld(screen.x, screen.y), screen, e);
    };
    canvas.addEventListener("pointermove", handler);
    return () => canvas.removeEventListener("pointermove", handler);
}
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorld: (screenX: number, screenY: number) => { x: number, y: number },
 *   onPointerUp: (world: { x: number, y: number }, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 * @returns {() => void}
 */
export function bindCanvasPointerUp(canvas, { screenToWorld, onPointerUp }) {
    const handler = (e) => {
        const screen = canvasClientCoords(canvas, e.clientX, e.clientY);
        onPointerUp(screenToWorld(screen.x, screen.y), screen, e);
    };
    canvas.addEventListener("pointerup", handler);
    canvas.addEventListener("pointercancel", handler);
    return () => {
        canvas.removeEventListener("pointerup", handler);
        canvas.removeEventListener("pointercancel", handler);
    };
}
