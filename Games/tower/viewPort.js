/** @typedef {import("../../Core/GameDefinitionTypes.js").ViewPort} ViewPort */

/** @type {ViewPort} */
export const towerViewPort = {
    getViewCenter(state) {
        const player = state.player;
        return player ? { x: player.x, y: player.y } : null;
    },
};
