import { RunSceneController, compileRunScenes } from "../../../Libraries/RunScene/index.js";
import { applyRunSceneSpawn } from "../runSceneSpawns.js";
import { markTowerRadioTriggersSeen } from "../towerRadioSeen.js";
import { introGuardsScene } from "../scenes/introGuards.js";
import { clueSearchScene } from "../scenes/clueSearch.js";
import { mainCombatScene } from "../scenes/mainCombat.js";

/**
 * Dev override: jump to a run scene on new run (skips prior scenes via onSkip).
 * null = play from the beginning.
 * @type {null | "intro_guards" | "clue_search" | "main_combat"}
 */
export const startRunAtScene = null;

export const runScenes = [introGuardsScene, clueSearchScene, mainCombatScene];

export const runSceneController = new RunSceneController({
    scenes: compileRunScenes(runScenes, { applySpawn: applyRunSceneSpawn }),
    markRadiosSeen: markTowerRadioTriggersSeen,
});
