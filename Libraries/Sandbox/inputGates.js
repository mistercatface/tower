import { resolveWorldPropInputGateRules } from "./sandboxBehaviorConfig.js";
import { resolveSandboxEntityLinkValue } from "../../GameState/sandboxEntityMeta.js";
import { isKinematicallyActive } from "../Spatial/collision/entityBroadphase.js";
/**
 * @typedef {"self" | "groupWorldProps" | "groupKinetic"} InputGateScope
 * @typedef {"atRest" | "asleep" | "allAtRest" | "allAsleep"} InputGateUntil
 * @typedef {{
 *   scope: InputGateScope,
 *   until: InputGateUntil,
 *   link?: string,
 *   excludeStates?: string[],
 * }} InputGateRule
 * @typedef {{ allowed: boolean, failedRule?: InputGateRule }} InputGateResult
 */
/** @param {object} entity */
export function isEntityAtRest(entity) {
    if (!entity || entity.isDead) return true;
    return !isKinematicallyActive(entity);
}
/** @param {object} entity */
export function isEntityAsleep(entity) {
    if (!entity || entity.isDead) return true;
    return Boolean(entity.isSleeping);
}
/** @param {object} entity @param {InputGateUntil} until */
function entityPassesUntil(entity, until) {
    if (until === "atRest" || until === "allAtRest") return isEntityAtRest(entity);
    return isEntityAsleep(entity);
}
/** @param {object} entity @param {string[] | undefined} excludeStates */
function isExcludedFromGate(entity, excludeStates) {
    if (!excludeStates?.length) return false;
    const state = entity.currentStateName;
    return state != null && excludeStates.includes(state);
}
export function resolveInputGateScope(scope, prop, state, linkField) {
    if (scope === "self") return [prop];
    const linkValue = linkField ? resolveSandboxEntityLinkValue(state, prop, linkField) : undefined;
    if (linkValue == null) return [];
    const members = [];
    const worldProps = state.worldProps;
    for (let i = 0; i < worldProps.length; i++) {
        const entity = worldProps[i];
        if (entity.isDead) continue;
        if (resolveSandboxEntityLinkValue(state, entity, linkField) !== linkValue) continue;
        if (scope === "groupKinetic" && !entity.strategy?.isKinetic) continue;
        members.push(entity);
    }
    return members;
}
/** @param {object[]} entities @param {InputGateUntil} until @param {string[] | undefined} excludeStates */
function scopePassesUntil(entities, until, excludeStates) {
    const aggregate = until === "allAtRest" || until === "allAsleep";
    const predicate = aggregate ? (until === "allAtRest" ? "atRest" : "asleep") : until;
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (isExcludedFromGate(entity, excludeStates)) continue;
        if (!entityPassesUntil(entity, predicate)) return false;
    }
    return true;
}
export function evaluateInputGateRule(rule, prop, state) {
    const entities = resolveInputGateScope(rule.scope, prop, state, rule.link);
    if (entities.length === 0) return true;
    return scopePassesUntil(entities, rule.until, rule.excludeStates);
}
/**
 * @param {string} behaviorId
 * @param {object} prop
 * @param {object | null | undefined} asset
 * @param {object} state
 */
export function evaluateInputGates(behaviorId, prop, asset, state) {
    const rules = resolveWorldPropInputGateRules(state, prop, asset, behaviorId);
    if (rules.length === 0) return { allowed: true };
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (!evaluateInputGateRule(rule, prop, state)) return { allowed: false, failedRule: rule };
    }
    return { allowed: true };
}
