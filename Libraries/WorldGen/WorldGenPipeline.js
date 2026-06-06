import { createWorldGenContext } from "./phases.js";
/** @typedef {import("./phases.js").WorldGenPhase} WorldGenPhase */
/** @typedef {import("../../Core/GameDefinitionTypes.js").WorldGenPort} WorldGenPort */
export class WorldGenPipeline {
    /** @param {WorldGenPhase[]} phases */
    constructor(phases) {
        this.phases = phases;
    }
    /** @param {object} state */
    run(state) {
        const ctx = createWorldGenContext(state);
        for (const phase of this.phases) phase.run(ctx);
    }
}
/**
 * Compose a `WorldGenPort` from ordered phases + port metadata (layouts, bounds, strategies).
 *
 * @param {WorldGenPhase[]} phases
 * @param {Omit<WorldGenPort, "generateWorld">} portOptions
 * @returns {WorldGenPort}
 */
export function createWorldGenPort(phases, portOptions) {
    const pipeline = new WorldGenPipeline(phases);
    return {
        generateWorld(state) {
            pipeline.run(state);
        },
        ...portOptions,
    };
}
