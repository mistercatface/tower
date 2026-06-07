import { isSimulation } from "../../GameState/GamePhase.js";
import { runSceneController } from "./config/runScenes.js";
/** @typedef {import("../../Systems/Simulation/SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime: SimulationRuntime) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const hordePhase = {
    run(ctx, dt) {
        if (!isSimulation(ctx.state.phase)) return;
        if (runSceneController.getCurrentCapabilities().horde !== true) return;
        ctx.state.hordeSpawner.manageSpawning(dt, ctx.state, ctx.upgrades);
    },
};
