/** @typedef {object} GameLauncher
 * @property {string} title
 * @property {boolean} hideEditor
 * @property {boolean} portraitOnly
 * @property {readonly string[]=} actions
 * @property {(state: object) => Promise<object>=} setup
 */
/** @type {Record<string, GameLauncher>} */
export const GAME_LAUNCHERS = { snake: { title: "Snake", hideEditor: false } };
/** @param {string} launchId */
export function getGameLauncher(launchId) {
    const launcher = GAME_LAUNCHERS[launchId];
    if (!launcher) throw new Error(`Unknown game launch id: ${launchId}`);
    return launcher;
}
