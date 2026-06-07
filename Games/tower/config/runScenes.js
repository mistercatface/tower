import { fireRadioTrigger } from "../../../Libraries/Radio/radioEvents.js";
import { RunSceneController, compileRunScenes, createRunSceneBehaviors } from "../runScene/index.js";
import { clueSearchInspectKeys, clueSearchInspectRadioTriggers } from "./inspectManifest.js";
import { towerRunScenePorts } from "../runScenePorts.js";
/**
 * Dev override in code. Overridden by URL `?scene=<id>` when the id is valid.
 * null = play from the beginning.
 * @type {null | "run_start" | "intro_guards" | "clue_search" | "main_combat"}
 */
export const startRunAtScene = null;
/** @type {import("../runScene/compileRunScenes.js").RunSceneConfig[]} */
export const runScenes = [
    {
        id: "run_start",
        type: "run_opening",
        phase: "simulation",
        spawn: "yard",
        radios: ["run_start"],
        skipPreset: "through_run_start",
        config: { radio: "run_start" },
        completeWhen: { runSceneFlag: "opening.completed" },
    },
    {
        id: "intro_guards",
        type: "proximity_radio_fight",
        phase: "simulation",
        radios: ["start_game_guards", "intro_guards_cleared"],
        skipPreset: "through_intro",
        config: {
            dialogRadio: "start_game_guards",
            dialogRadius: 52,
            enemyTag: "isIntroGuard",
            guards: [
                { enemyType: "fast", spawn: "guard_left" },
                { enemyType: "dodger", spawn: "guard_right" },
            ],
        },
        completeWhen: { and: [{ runSceneFlag: "intro.completed" }, { noLivingEnemiesWithTag: "isIntroGuard" }] },
        transition: { radio: "intro_guards_cleared" },
    },
    {
        id: "clue_search",
        type: "inspect_collect",
        phase: "inspector",
        spawn: "foyer",
        radios: [...clueSearchInspectRadioTriggers, "clue_search_complete"],
        skipPreset: "through_clue_search",
        capabilities: { blockTurret: true },
        config: { keys: clueSearchInspectKeys, missionLabel: "Tap nearby objects to search for clues ({found}/{total})", completeRadio: "clue_search_complete", returnPhase: "simulation" },
        completeWhen: "mission_completed",
    },
    { id: "main_combat", phase: "simulation", spawn: "corridor", capabilities: { horde: true }, completeWhen: "never" },
];
const behaviors = createRunSceneBehaviors(towerRunScenePorts);
export const runSceneController = new RunSceneController({
    scenes: compileRunScenes(runScenes, { applySpawn: towerRunScenePorts.applySpawn, behaviors }),
    markRadiosSeen: towerRunScenePorts.markRadiosSeen,
    fireRadioTrigger,
    runStartRadios: [],
});
/**
 * Resolve dev start scene: URL `?scene=clue_search` wins over `startRunAtScene` constant.
 * @returns {string | null}
 */
export function getStartRunAtScene() {
    if (typeof window !== "undefined") {
        const fromUrl = new URLSearchParams(window.location.search).get("scene");
        if (fromUrl && runScenes.some((scene) => scene.id === fromUrl)) return fromUrl;
    }
    return startRunAtScene;
}
