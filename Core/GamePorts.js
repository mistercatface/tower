import { PairFilter } from "../Libraries/Interaction/PairFilter.js";
import { createDefaultInteractionPairs } from "../Libraries/Interaction/defaultPhysicsPairs.js";
import { BaseGeneratorStrategies } from "../Generator/GeneratorStrategies.js";
import { NOOP_TARGETING_PORT, NOOP_VIEW_PORT } from "../Libraries/Ports/noopPorts.js";
import { getActiveGameDefinition } from "./ActiveGameDefinition.js";
/** @typedef {import("./GameDefinitionTypes.js").InteractionPairsPort} InteractionPairsPort */
/** @typedef {import("./GameDefinitionTypes.js").TargetingPort} TargetingPort */
/** @typedef {import("./GameDefinitionTypes.js").ViewPort} ViewPort */
/** @typedef {import("./GameDefinitionTypes.js").RenderPorts} RenderPorts */
/** @typedef {import("./GameDefinitionTypes.js").WorldGenPort} WorldGenPort */
/** @typedef {import("./GameDefinitionTypes.js").RunBootstrapPort} RunBootstrapPort */
function requireGameDefinition() {
    const def = getActiveGameDefinition();
    if (!def) throw new Error("No active game definition — call setActiveGameDefinition before using game ports.");
    return def;
}
/** @returns {InteractionPairsPort} */
export function getInteractionPairs() {
    const overrides = requireGameDefinition().interactionPairs;
    const base = createDefaultInteractionPairs();
    return overrides ? { ...base, ...overrides } : base;
}
/** @returns {TargetingPort} */
export function getTargeting() {
    return requireGameDefinition().targeting ?? NOOP_TARGETING_PORT;
}
/** @returns {ViewPort} */
export function getViewPort() {
    return requireGameDefinition().viewPort ?? NOOP_VIEW_PORT;
}
/** @param {object} state */
export function getViewCenter(state) {
    return getViewPort().getViewCenter(state);
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
/** Roguelike map node → world scale; arena games default to 0. */
export function getNodeWorldCoordScale() {
    return getWorldGen().nodeWorldCoordScale ?? 0;
}
/** @param {string} phase */
export function isWorldScene(phase) {
    const check = requireGameDefinition().isWorldScene;
    if (check) return check(phase);
    return phase === "simulation";
}
/** @returns {RunBootstrapPort | null} */
export function getRunBootstrapPort() {
    return requireGameDefinition().runBootstrapPort ?? null;
}
/** @param {object} state */
export function resetRun(state) {
    getRunBootstrapPort()?.resetRun(state);
}
/** @param {object} state */
export function generateWorld(state) {
    const port = getWorldGen();
    if (!port.generateWorld) throw new Error("Active worldGen port missing generateWorld(state).");
    port.generateWorld(state);
}
/**
 * Playable world bounds for surface clip and camera helpers.
 *
 * @param {object} state
 * @returns {import("./GameDefinitionTypes.js").WorldPlayBounds | null}
 */
export function getWorldPlayBounds(state) {
    const port = getWorldGen();
    if (port.getPlayBounds) return port.getPlayBounds(state);
    const grid = state.obstacleGrid;
    if (!grid?.cols) return null;
    return { minX: grid.minX, minY: grid.minY, maxX: grid.maxX, maxY: grid.maxY };
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
export function getHostiles(state, actor) {
    return getTargeting().getHostiles(state, actor);
}
export function getBroadphaseActors(state) {
    return getTargeting().getBroadphaseActors(state);
}
export function getNearestHostile(state, source, range, excludedTargets = null, opts = {}) {
    return getTargeting().getNearestHostile(state, source, range, excludedTargets, opts);
}
