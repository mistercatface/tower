import { RunSceneController } from "../../../Libraries/RunScene/index.js";
import { createRunSceneHandlers } from "../runSceneHandlers.js";

/**
 * Dev override: jump to a run scene on new run (skips prior scenes via onSkip).
 * null = play from the beginning.
 * @type {null | "intro_guards" | "clue_search" | "main_combat"}
 */
export const startRunAtScene = "main_combat";

export const runSceneController = new RunSceneController({
    scenes: createRunSceneHandlers(),
});
