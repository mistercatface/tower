import { beginSimulationRuntime } from "./SimulationRuntime.js";
/** @typedef {import("./phases.js").SimulationPhase} SimulationPhase */
/** @typedef {import("../../Core/GameDefinitionTypes.js").SimulationPort} SimulationPort */
export class SimulationPipeline {
    /** @param {SimulationPhase[]} phases @param {(ctx: object) => import("./SimulationRuntime.js").SimulationRuntime} beginRuntime */
    constructor(phases, beginRuntime = beginSimulationRuntime) {
        this.phases = phases;
        this.beginRuntime = beginRuntime;
    }
    /** @param {object} ctx @param {number} dt */
    runTick(ctx, dt) {
        const runtime = this.beginRuntime(ctx);
        for (const phase of this.phases) phase.run(ctx, dt, runtime);
    }
}
/**
 * @param {SimulationPhase[]} phases
 * @param {Omit<SimulationPort, "runTick"> & { beginRuntime?: (ctx: object) => import("./SimulationRuntime.js").SimulationRuntime }} [options]
 * @returns {SimulationPort}
 */
export function createSimulationPort(phases, options = {}) {
    const beginRuntime = options.beginRuntime ?? beginSimulationRuntime;
    const tickPipeline = new SimulationPipeline(phases, beginRuntime);
    return { runTick: (ctx, dt) => tickPipeline.runTick(ctx, dt), onEnter: options.onEnter };
}
