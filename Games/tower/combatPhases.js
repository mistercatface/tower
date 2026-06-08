import { FloatingText } from "../../Render/FloatingText.js";
export { projectilesPhase, particlesPhase, explosionsPhase, dispatchEventsPhase, combatParticlesPhase, ragdollCorpsePhase } from "../../Libraries/Combat/simulationPhases.js";
/** @typedef {import("../../Systems/Simulation/SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime?: SimulationRuntime) => void }} SimulationPhase */
/** Tower-only floating combat text. */
/** @type {SimulationPhase} */
export const floatingTextPhase = {
    run(ctx, dt) {
        FloatingText.updateAll(ctx.state, dt);
    },
};
