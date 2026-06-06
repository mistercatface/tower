/**
 * @typedef {import("./compileRunScenes.js").RunSceneConfig} RunSceneConfig
 */

/** @type {Record<string, (state: object, def: RunSceneConfig) => void>} */
export const skipPresets = {
    through_intro(state) {
        state.startGameIntroCompleted = true;
        state.startGameIntroActive = false;
        state.startGameIntroTriggered = true;
    },

    through_clue_search(state, def) {
        skipPresets.through_intro(state, def);
        const keys = def.config?.keys ?? [];
        state.runMission = {
            type: "inspect_collect",
            keys,
            seen: new Set(keys),
            active: false,
            finishing: false,
            completed: true,
        };
        state.clueSearchCompleted = true;
        state.clueSearchActive = false;
        state.clueSearchFinishing = false;
    },
};

/** @param {string} preset @param {object} state @param {RunSceneConfig} def */
export function applySkipPreset(preset, state, def) {
    skipPresets[preset]?.(state, def);
}
