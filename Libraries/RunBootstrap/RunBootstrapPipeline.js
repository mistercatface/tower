/**
 * @typedef {object} RunBootstrapContext
 * @property {object} state
 * @property {object[]} upgrades
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
 * @param {Omit<import("../../Core/GameDefinitionTypes.js").RunBootstrapPort, "resetRun">} [_portOptions]
 * @returns {import("../../Core/GameDefinitionTypes.js").RunBootstrapPort}
 */
export function createRunBootstrapPort(phases) {
    const pipeline = new RunBootstrapPipeline(phases);
    return {
        resetRun(state, upgrades) {
            pipeline.run({ state, upgrades });
        },
    };
}
