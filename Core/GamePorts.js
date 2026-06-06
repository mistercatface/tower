import { PairFilter } from "../Libraries/Interaction/PairFilter.js";
import { createDefaultInteractionPairs } from "../Libraries/Interaction/defaultPhysicsPairs.js";
import { BaseGeneratorStrategies } from "../Generator/GeneratorStrategies.js";
import { getActiveGameDefinition } from "./ActiveGameDefinition.js";

/** @typedef {import("./GameDefinitionTypes.js").InteractionPairsPort} InteractionPairsPort */
/** @typedef {import("./GameDefinitionTypes.js").SimulationPort} SimulationPort */
/** @typedef {import("./GameDefinitionTypes.js").TargetingPort} TargetingPort */
/** @typedef {import("./GameDefinitionTypes.js").RenderPorts} RenderPorts */
/** @typedef {import("./GameDefinitionTypes.js").WorldGenPort} WorldGenPort */

function requireGameDefinition() {
    const def = getActiveGameDefinition();
    if (!def) {
        throw new Error("No active game definition — call setActiveGameDefinition before using game ports.");
    }
    return def;
}

/** @returns {InteractionPairsPort} */
export function getInteractionPairs() {
    const overrides = requireGameDefinition().interactionPairs;
    const base = createDefaultInteractionPairs();
    return overrides ? { ...base, ...overrides } : base;
}

/** @returns {SimulationPort} */
export function getSimulationPort() {
    const port = requireGameDefinition().simulationPort;
    if (!port) throw new Error("Active game definition missing simulationPort.");
    return port;
}

/** @returns {TargetingPort} */
export function getTargeting() {
    const targeting = requireGameDefinition().targeting;
    if (!targeting) throw new Error("Active game definition missing targeting port.");
    return targeting;
}

/** @returns {RenderPorts} */
export function getRenderPorts() {
    const render = requireGameDefinition().render;
    if (!render) throw new Error("Active game definition missing render port.");
    return render;
}

/** @returns {WorldGenPort} */
export function getWorldGen() {
    const worldGen = requireGameDefinition().worldGen;
    if (!worldGen) throw new Error("Active game definition missing worldGen port.");
    return worldGen;
}

/** Game-specific strategies merged over engine defaults. */
export function getGeneratorStrategies() {
    return { ...BaseGeneratorStrategies, ...getWorldGen().strategies };
}

/** Strategy keys used for random generation on non-start map nodes. */
export function getRandomGeneratorStrategyKeys() {
    return Object.keys(BaseGeneratorStrategies);
}

/** @type {Map<keyof InteractionPairsPort, PairFilter>} */
const pairFilterCache = new Map();

export function clearInteractionPairFilterCache() {
    pairFilterCache.clear();
}

/** @param {keyof InteractionPairsPort} name */
export function getInteractionPairFilter(name) {
    let filter = pairFilterCache.get(name);
    if (!filter) {
        filter = new PairFilter(getInteractionPairs()[name]);
        pairFilterCache.set(name, filter);
    }
    return filter;
}

export function inferFaction(actor) {
    return getTargeting().inferFaction(actor);
}

export function areHostile(a, b) {
    return getTargeting().areHostile(a, b);
}

export function getPlayerActors(state) {
    return getTargeting().getPlayerActors(state);
}

export function getHostiles(state, actor) {
    return getTargeting().getHostiles(state, actor);
}

export function getNearestHostile(state, source, range, excludedTargets = null, opts = {}) {
    return getTargeting().getNearestHostile(state, source, range, excludedTargets, opts);
}

export function isValidTurretTarget(actor, target, state, range, blocksTargeting, opts = {}) {
    return getTargeting().isValidTurretTarget(actor, target, state, range, blocksTargeting, opts);
}
