import { getRunSceneMission, resolveRunSceneFlag } from "./runSceneState.js";

/**
 * @typedef {string | Record<string, unknown> | { and: unknown[] }} CompleteWhenRule
 */

/**
 * @param {CompleteWhenRule | undefined} rule
 * @param {object} state
 * @param {object} ctx
 */
export function evaluateCompleteWhen(rule, state, ctx) {
    if (!rule) return false;
    if (typeof rule === "string") return evaluateCompleteWhenNamed(rule, state, ctx);
    if (Array.isArray(rule.and)) {
        return rule.and.every((child) => evaluateCompleteWhen(child, state, ctx));
    }
    return evaluateCompleteWhenObject(rule, state, ctx);
}

function evaluateCompleteWhenNamed(rule, state, _ctx) {
    switch (rule) {
        case "mission_completed":
            return getRunSceneMission(state)?.completed === true;
        case "never":
            return false;
        default:
            return false;
    }
}

function evaluateCompleteWhenObject(rule, state, _ctx) {
    if (rule.runSceneFlag) return resolveRunSceneFlag(state, rule.runSceneFlag);
    if (rule.noLivingEnemiesWithTag) {
        const tag = rule.noLivingEnemiesWithTag;
        return !state.enemies.some((enemy) => !enemy.isDead && enemy[tag]);
    }
    return false;
}
