/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 */
export function canvasClientCoords(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top,
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorld: (screenX: number, screenY: number) => { x: number, y: number },
 *   onPointerDown: (world: { x: number, y: number }, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 */
export function bindCanvasPointerDown(canvas, { screenToWorld, onPointerDown }) {
    canvas.addEventListener("pointerdown", (e) => {
        const screen = canvasClientCoords(canvas, e.clientX, e.clientY);
        onPointerDown(screenToWorld(screen.x, screen.y), screen, e);
    });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   screenToWorld: (screenX: number, screenY: number) => { x: number, y: number },
 *   onPointerMove: (world: { x: number, y: number }, screen: { x: number, y: number }, event: PointerEvent) => void,
 * }} handlers
 */
export function bindCanvasPointerMove(canvas, { screenToWorld, onPointerMove }) {
    canvas.addEventListener("pointermove", (e) => {
        const screen = canvasClientCoords(canvas, e.clientX, e.clientY);
        onPointerMove(screenToWorld(screen.x, screen.y), screen, e);
    });
}
