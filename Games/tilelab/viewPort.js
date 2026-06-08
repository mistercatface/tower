/** @typedef {import("../../Core/GameDefinitionTypes.js").ViewPort} ViewPort */

/** @type {ViewPort} */
export const tilelabViewPort = {
    getViewCenter(state) {
        const viewport = state.mapViewport;
        return viewport ? { x: viewport.x, y: viewport.y } : null;
    },
};
