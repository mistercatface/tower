import { fireRadioTrigger } from "../../../Core/EventSystem.js";
import { ensureRunScene } from "../runSceneState.js";

/**
 * Opening beat — plays a run-start radio, then advances via completeWhen.
 * @param {import("../compileRunScenes.js").RunSceneConfig} def
 */
export function runOpeningBehavior(def) {
    const radio = def.config?.radio ?? "run_start";

    return {
        enter(state) {
            const runScene = ensureRunScene(state);
            if (runScene.opening?.completed) return;

            fireRadioTrigger(radio, () => {
                if (!runScene.opening) runScene.opening = { completed: false };
                runScene.opening.completed = true;
            }, state);
        },
    };
}
