import { ensureRunScene, getRunSceneIntro, setRunSceneMission } from "./runSceneState.js";

/**
 * @typedef {import("./compileRunScenes.js").RunSceneConfig} RunSceneConfig
 */

/** @type {Record<string, (state: object, def: RunSceneConfig) => void>} */
export const skipPresets = {
    through_run_start(state, _def, ctx) {
        ensureRunScene(state).opening.completed = true;
        ctx?.game?.onRunOpeningComplete?.({ state, upgrades: ctx.upgrades });
    },

    through_intro(state) {
        const intro = getRunSceneIntro(state);
        intro.completed = true;
        intro.active = false;
        intro.triggered = true;
    },

    through_clue_search(state, def) {
        skipPresets.through_intro(state, def);
        const keys = def.config?.keys ?? [];
        setRunSceneMission(state, {
            type: "inspect_collect",
            keys,
            seen: new Set(keys),
            active: false,
            finishing: false,
            completed: true,
            guidedRadios: def.config?.guidedRadios ?? {},
        });
    },
};

/** @param {string} preset @param {object} state @param {RunSceneConfig} def @param {object} [ctx] */
export function applySkipPreset(preset, state, def, ctx) {
    skipPresets[preset]?.(state, def, ctx);
}
