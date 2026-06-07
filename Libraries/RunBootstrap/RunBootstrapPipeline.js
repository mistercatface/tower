/**
 * @typedef {object} RunBootstrapContext
 * @property {object} state
 */
/** @typedef {{ run: (ctx: RunBootstrapContext) => void }} RunBootstrapPhase */
export class RunBootstrapPipeline {
    /** @param {RunBootstrapPhase[]} phases */
    constructor(phases) {
        this.phases = phases;
    }
    /** @param {RunBootstrapContext} ctx */
    run(ctx) {
        for (const phase of this.phases) phase.run(ctx);
    }
}
/**
 * @param {RunBootstrapPhase[]} phases
 * @returns {import("../../Core/GameDefinitionTypes.js").RunBootstrapPort}
 */
export function createRunBootstrapPort(phases) {
    const pipeline = new RunBootstrapPipeline(phases);
    return {
        resetRun(state) {
            pipeline.run({ state });
        },
    };
}
