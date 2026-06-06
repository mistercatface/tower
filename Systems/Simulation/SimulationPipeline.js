import { beginSimulationRuntime } from "./SimulationRuntime.js";
/** @typedef {import("./phases.js").SimulationPhase} SimulationPhase */
/** @typedef {import("../../Core/GameDefinitionTypes.js").SimulationPort} SimulationPort */
export class SimulationPipeline {
    /** @param {SimulationPhase[]} phases */
    constructor(phases) {
        this.phases = phases;
    }
    /** @param {object} ctx @param {number} dt */
    runTick(ctx, dt) {
        const runtime = beginSimulationRuntime(ctx);
        for (const phase of this.phases) phase.run(ctx, dt, runtime);
    }
}
/**
 * @param {SimulationPhase[]} phases
 * @param {Omit<SimulationPort, "runTick" | "runInspectorTick"> & { inspectorPhases?: SimulationPhase[] }} [options]
 * @returns {SimulationPort}
 */
export function createSimulationPort(phases, options = {}) {
    const tickPipeline = new SimulationPipeline(phases);
    const inspectorPipeline = options.inspectorPhases ? new SimulationPipeline(options.inspectorPhases) : null;
    return {
        runTick: (ctx, dt) => tickPipeline.runTick(ctx, dt),
        runInspectorTick: inspectorPipeline ? (ctx, dt) => inspectorPipeline.runTick(ctx, dt) : undefined,
        onEnter: options.onEnter,
        onInspectorEnter: options.onInspectorEnter,
    };
}
