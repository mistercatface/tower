import { proximityRadioFightBehavior } from "./proximityRadioFight.js";
import { inspectCollectBehavior } from "./inspectCollect.js";
import { runOpeningBehavior } from "./runOpening.js";
/**
 * @param {import("../runScenePorts.js").RunScenePorts} ports
 */
export function createRunSceneBehaviors(ports) {
    return { run_opening: (def) => runOpeningBehavior(def), proximity_radio_fight: (def) => proximityRadioFightBehavior(def, ports), inspect_collect: (def) => inspectCollectBehavior(def, ports) };
}
