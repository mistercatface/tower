import { fireRadioTrigger } from "../../../Core/EventSystem.js";
import { RunSceneController, compileRunScenes, createRunSceneBehaviors } from "../../../Libraries/RunScene/index.js";
import { yardballRunScenePorts } from "../runScenePorts.js";

/**
 * @type {null | "kickoff" | "roll_to_goal" | "sunk"}
 */
export const startRunAtScene = null;

/** @type {import("../../../Libraries/RunScene/compileRunScenes.js").RunSceneConfig[]} */
export const runScenes = [
    {
        id: "kickoff",
        type: "run_opening",
        phase: "combat",
        spawn: "yard",
        radios: ["kickoff"],
        skipPreset: "through_run_start",
        config: { radio: "kickoff" },
        completeWhen: { runSceneFlag: "opening.completed" },
    },
    {
        id: "roll_to_goal",
        phase: "combat",
        spawn: "yard",
        completeWhen: { runSceneFlag: "goal.reached" },
        transition: { radio: "goal_complete" },
    },
    {
        id: "sunk",
        phase: "combat",
        spawn: "foyer",
        completeWhen: "never",
    },
];

const behaviors = createRunSceneBehaviors(yardballRunScenePorts);

export const runSceneController = new RunSceneController({
    scenes: compileRunScenes(runScenes, {
        applySpawn: yardballRunScenePorts.applySpawn,
        behaviors,
    }),
    markRadiosSeen: yardballRunScenePorts.markRadiosSeen,
    fireRadioTrigger,
    runStartRadios: ["kickoff"],
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
