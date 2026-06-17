import { setupLabViewportNavigation } from "./lab-shared.js";
/** @type {((dt: number) => void) | null} */
let tickKeyboardPan = null;
/** @param {number} dt */
export function tickGameViewportNavigation(dt) {
    tickKeyboardPan?.(dt);
}
/** @param {import("../state.js").TileLabGameState} state */
export function mountGameViewport(state) {
    tickKeyboardPan = setupLabViewportNavigation("gameCanvas", {
        getCamera: () => state.viewport,
        setCamera: (x, y, zoom) => {
            state.viewport.snapTo(x, y);
            state.viewport.zoom = zoom;
        },
    });
}
/** @param {import("../state.js").TileLabGameState} state */
export function fitGameCanvasToStage(state) {
    const canvas = state.editor.canvas;
    const stage = document.getElementById("gameStage");
    const rect = stage.getBoundingClientRect();
    const size = Math.max(128, Math.floor(Math.min(rect.width, rect.height)));
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d").imageSmoothingEnabled = false;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    state.viewport.setCanvasSize(size, size);
}
