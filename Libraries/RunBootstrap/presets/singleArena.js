import { createRunBootstrapPort } from "../RunBootstrapPipeline.js";
import { generateWorldPhase, initRunStatePhase } from "../phases.js";
/** Prop-only arena — world bake only; entities spawn on simulation enter. */
export function createSingleArenaRunBootstrapPort() {
    return createRunBootstrapPort([initRunStatePhase, generateWorldPhase]);
}
