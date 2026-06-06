import { proximityRadioFightBehavior } from "./proximityRadioFight.js";
import { inspectCollectBehavior } from "./inspectCollect.js";

/**
 * @param {import("../runScenePorts.js").RunScenePorts} ports
 */
export function createRunSceneBehaviors(ports) {
    return {
        proximity_radio_fight: (def) => proximityRadioFightBehavior(def, ports),
        inspect_collect: (def) => inspectCollectBehavior(def, ports),
    };
}
