import { fireRadioTrigger } from "../../../Core/EventSystem.js";
import { RunSceneController, compileRunScenes, createRunSceneBehaviors } from "../../../Libraries/RunScene/index.js";
import { towerRunScenePorts } from "../runScenePorts.js";

/**
 * Dev override: jump to a run scene on new run (skips prior scenes via onSkip).
 * null = play from the beginning.
 * @type {null | "intro_guards" | "clue_search" | "main_combat"}
 */
export const startRunAtScene = null;

/** @type {import("../../../Libraries/RunScene/compileRunScenes.js").RunSceneConfig[]} */
export const runScenes = [
    {
        id: "intro_guards",
        type: "proximity_radio_fight",
        phase: "combat",
        spawn: "yard",
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
        completeWhen: {
            and: [
                { runSceneFlag: "intro.completed" },
                { noLivingEnemiesWithTag: "isIntroGuard" },
            ],
        },
        transition: { radio: "intro_guards_cleared" },
    },
    {
        id: "clue_search",
        type: "inspect_collect",
        phase: "inspector",
        spawn: "foyer",
        radios: ["inspect:jacko_can", "inspect:wood_crate", "clue_search_complete"],
        skipPreset: "through_clue_search",
        capabilities: { blockTurret: true },
        config: {
            keys: ["jacko_can", "wood_crate"],
            missionLabel: "Tap nearby objects to search for clues ({found}/{total})",
            completeRadio: "clue_search_complete",
            returnPhase: "combat",
            guidedRadios: {
                jacko_can: "inspect_jacko_can_garbanzo",
                wood_crate: "inspect_wood_crate_barry_brock",
            },
        },
        completeWhen: "mission_completed",
    },
    {
        id: "main_combat",
        phase: "combat",
        spawn: "corridor",
        capabilities: { horde: true },
        completeWhen: "never",
    },
];

const behaviors = createRunSceneBehaviors(towerRunScenePorts);

export const runSceneController = new RunSceneController({
    scenes: compileRunScenes(runScenes, {
        applySpawn: towerRunScenePorts.applySpawn,
        behaviors,
    }),
    markRadiosSeen: towerRunScenePorts.markRadiosSeen,
    fireRadioTrigger,
});
