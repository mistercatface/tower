import { createRunBootstrapPort } from "../RunBootstrapPipeline.js";
import { createHideArenaPlayerPhase, generateWorldPhase, initRunStatePhase, placePlayerFromLayoutPhase } from "../phases.js";
/**
 * Arena games — world + player anchor only; entities spawn on simulation enter.
 *
 * @param {(player: object) => void} hidePlayer
 */
export function createSingleArenaRunBootstrapPort(hidePlayer) {
    return createRunBootstrapPort([initRunStatePhase, generateWorldPhase, placePlayerFromLayoutPhase, createHideArenaPlayerPhase(hidePlayer)]);
}
