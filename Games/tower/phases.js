import { isSimulation } from "../../GameState/GamePhase.js";
import { runSceneController } from "./config/runScenes.js";
import { ProgressionManager } from "./progression/ProgressionManager.js";
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
/** @type {SimulationPhase} */
export const abilitiesPhase = {
    run(ctx, dt, runtime) {
        runtime.abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);
    },
};
/** @type {SimulationPhase} */
export const upgradesPhase = {
    run(ctx, dt) {
        ctx.upgrades.forEach((upg) => upg.update(dt, ctx.state));
    },
};
/** @type {SimulationPhase} */
export const levelUpsPhase = {
    run(ctx) {
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);
    },
};
