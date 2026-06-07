import { combatSpatial } from "../World/CombatSpatialFrame.js";
/**
 * @typedef {object} SimulationRuntime
 * @property {import("../World/CombatSpatialFrame.js").CombatSpatialFrame} spatialFrame
 * @property {object[]} events
 * @property {{ isDiving: boolean, externalSpeedMod: number } | null} abilityState
 */
/** @param {object} ctx */
export function beginSimulationRuntime(ctx) {
    const events = typeof ctx.state.beginCombatEvents === "function" ? ctx.state.beginCombatEvents() : [];
    return { spatialFrame: combatSpatial.begin(ctx.state), events, abilityState: null };
}
