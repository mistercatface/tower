import { PairFilter } from "../Libraries/Interaction/PairFilter.js";
import { getActiveGameDefinition } from "./ActiveGameDefinition.js";

/** @typedef {import("./GameDefinitionTypes.js").CombatPairsPort} CombatPairsPort */
/** @typedef {import("./GameDefinitionTypes.js").TargetingPort} TargetingPort */
/** @typedef {import("./GameDefinitionTypes.js").RenderPorts} RenderPorts */

function requireGameDefinition() {
    const def = getActiveGameDefinition();
    if (!def) {
        throw new Error("No active game definition — call setActiveGameDefinition before using game ports.");
    }
    return def;
}

/** @returns {CombatPairsPort} */
export function getCombatPairs() {
    const pairs = requireGameDefinition().combatPairs;
    if (!pairs) throw new Error("Active game definition missing combatPairs port.");
    return pairs;
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

/** @type {Map<keyof CombatPairsPort, PairFilter>} */
const pairFilterCache = new Map();

/** @param {keyof CombatPairsPort} name */
export function getCombatPairFilter(name) {
    let filter = pairFilterCache.get(name);
    if (!filter) {
        filter = new PairFilter(getCombatPairs()[name]);
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
