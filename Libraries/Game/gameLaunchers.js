/** @typedef {object} GameLauncher
 * @property {string} title
 * @property {boolean} hideEditor
 * @property {boolean} portraitOnly
 * @property {readonly string[]} actions
 */
/** @type {Record<string, GameLauncher>} */
export const GAME_LAUNCHERS = {
    puzzle: { title: "Puzzle", hideEditor: true, portraitOnly: true, lockPortraitOrientation: true, actions: ["stampBeltCratePuzzle", "focusBlueBall", "snapCameraToTarget", "fitPlayViewport"] },
};
/** @param {string} launchId */
export function getGameLauncher(launchId) {
    const launcher = GAME_LAUNCHERS[launchId];
    if (!launcher) throw new Error(`Unknown game launch id: ${launchId}`);
    return launcher;
}
