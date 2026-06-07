import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
/** @typedef {import("../../Systems/Simulation/SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @param {object} ctx @returns {SimulationRuntime} */
export function beginTowerSimulationRuntime(ctx) {
    return { spatialFrame: combatSpatial.begin(ctx.state), events: ctx.state.beginCombatEvents(), abilityState: null };
}
