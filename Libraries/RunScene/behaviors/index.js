import { proximityRadioFightBehavior } from "./proximityRadioFight.js";
import { inspectCollectBehavior } from "./inspectCollect.js";
import { openCombatBehavior } from "./openCombat.js";

/** @type {Record<string, (def: import("../compileRunScenes.js").RunSceneConfig) => object>} */
export const runSceneBehaviors = {
    proximity_radio_fight: proximityRadioFightBehavior,
    inspect_collect: inspectCollectBehavior,
    open_combat: openCombatBehavior,
};
