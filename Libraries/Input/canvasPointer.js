/**
 * Map a DOM pointer position to canvas pixel coordinates (handles CSS scaling).
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 */
export function canvasClientToScreen(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}
const POINTER_WORLD_XY = new Float32Array(2);
const POINTER_WORLD = { x: 0, y: 0 };
/** @param {import("../../Viewport/Viewport.js").Viewport} viewport */
export function canvasClientToWorld(canvas, viewport, clientX, clientY) {
    const screen = canvasClientToScreen(canvas, clientX, clientY);
    viewport.screenToWorldF32(POINTER_WORLD_XY, 0, screen.x, screen.y);
    POINTER_WORLD.x = POINTER_WORLD_XY[0];
    POINTER_WORLD.y = POINTER_WORLD_XY[1];
    return POINTER_WORLD;
}
export function canvasClientToWorldF32(buf, o, canvas, viewport, clientX, clientY) {
    const screen = canvasClientToScreen(canvas, clientX, clientY);
    viewport.screenToWorldF32(buf, o, screen.x, screen.y);
}
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorldF32: (buf: Float32Array, o: number, screenX: number, screenY: number) => void,
 *   onPointerDown: (worldX: number, worldY: number, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 * @returns {() => void}
 */
export function bindCanvasPointerDown(canvas, { screenToWorldF32, onPointerDown }) {
    const handler = (e) => {
        const screen = canvasClientToScreen(canvas, e.clientX, e.clientY);
        screenToWorldF32(POINTER_WORLD_XY, 0, screen.x, screen.y);
        onPointerDown(POINTER_WORLD_XY[0], POINTER_WORLD_XY[1], screen, e);
    };
    canvas.addEventListener("pointerdown", handler);
    return () => canvas.removeEventListener("pointerdown", handler);
}
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorldF32: (buf: Float32Array, o: number, screenX: number, screenY: number) => void,
 *   onPointerMove: (worldX: number, worldY: number, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 * @returns {() => void}
 */
export function bindCanvasPointerMove(canvas, { screenToWorldF32, onPointerMove }) {
    const handler = (e) => {
        const screen = canvasClientToScreen(canvas, e.clientX, e.clientY);
        screenToWorldF32(POINTER_WORLD_XY, 0, screen.x, screen.y);
        onPointerMove(POINTER_WORLD_XY[0], POINTER_WORLD_XY[1], screen, e);
    };
    canvas.addEventListener("pointermove", handler);
    return () => canvas.removeEventListener("pointermove", handler);
}
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorldF32: (buf: Float32Array, o: number, screenX: number, screenY: number) => void,
 *   onPointerUp: (worldX: number, worldY: number, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 * @returns {() => void}
 */
export function bindCanvasPointerUp(canvas, { screenToWorldF32, onPointerUp }) {
    const handler = (e) => {
        const screen = canvasClientToScreen(canvas, e.clientX, e.clientY);
        screenToWorldF32(POINTER_WORLD_XY, 0, screen.x, screen.y);
        onPointerUp(POINTER_WORLD_XY[0], POINTER_WORLD_XY[1], screen, e);
    };
    canvas.addEventListener("pointerup", handler);
    canvas.addEventListener("pointercancel", handler);
    return () => {
        canvas.removeEventListener("pointerup", handler);
        canvas.removeEventListener("pointercancel", handler);
    };
}
/**
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, (e: PointerEvent) => void>} handlers
 * @returns {() => void}
 */
export function bindCanvasPointers(canvas, handlers) {
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
 * @param {HTMLCanvasElement} canvas
 * @param {(e: MouseEvent) => void} handler
 * @returns {() => void}
 */
export function bindCanvasContextMenu(canvas, handler) {
    const onContextMenu = (e) => {
        handler(e);
    };
    canvas.addEventListener("contextmenu", onContextMenu, true);
    return () => canvas.removeEventListener("contextmenu", onContextMenu, true);
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
