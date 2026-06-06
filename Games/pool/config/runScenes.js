import { fireRadioTrigger } from "../../../Core/EventSystem.js";
import { RunSceneController, compileRunScenes, createRunSceneBehaviors } from "../../../Libraries/RunScene/index.js";
import { poolRunScenePorts } from "../runScenePorts.js";

/** @type {null | "break_shot" | "match" | "cleared"} */
export const startRunAtScene = null;

/** @type {import("../../../Libraries/RunScene/compileRunScenes.js").RunSceneConfig[]} */
export const runScenes = [
    {
        id: "break_shot",
        type: "run_opening",
        phase: "simulation",
        spawn: "head",
        radios: ["break_shot"],
        skipPreset: "through_run_start",
        config: { radio: "break_shot" },
        completeWhen: { runSceneFlag: "opening.completed" },
    },
    {
        id: "match",
        phase: "simulation",
        spawn: "head",
        completeWhen: { runSceneFlag: "match.won" },
        transition: { radio: "table_clear" },
    },
    {
        id: "cleared",
        phase: "simulation",
        spawn: "head",
        completeWhen: "never",
    },
];

const behaviors = createRunSceneBehaviors(poolRunScenePorts);

export const runSceneController = new RunSceneController({
    scenes: compileRunScenes(runScenes, {
        applySpawn: poolRunScenePorts.applySpawn,
        behaviors,
    }),
    markRadiosSeen: poolRunScenePorts.markRadiosSeen,
    fireRadioTrigger,
    runStartRadios: ["break_shot"],
});

export function getStartRunAtScene() {
    if (typeof window !== "undefined") {
        const fromUrl = new URLSearchParams(window.location.search).get("scene");
        if (fromUrl && runScenes.some((scene) => scene.id === fromUrl)) {
            return fromUrl;
        }
    }
    return startRunAtScene;
}
