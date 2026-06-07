import { pushableSpatial } from "../World/PushableSpatialFrame.js";
/**
 * @typedef {object} SimulationRuntime
 * @property {import("../World/PushableSpatialFrame.js").PushableSpatialFrame | import("../World/CombatSpatialFrame.js").CombatSpatialFrame} spatialFrame
 * @property {object[]} events
 * @property {{ isDiving: boolean, externalSpeedMod: number } | null} abilityState
 */
/** @param {object} ctx */
export function beginSimulationRuntime(ctx) {
    return { spatialFrame: pushableSpatial.begin(ctx.state), events: [], abilityState: null };
}
