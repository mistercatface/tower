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

function evaluateCompleteWhenNamed(rule, state, ctx) {
    switch (rule) {
        case "mission_completed":
            return state.runMission?.completed === true;
        case "never":
            return false;
        default:
            return false;
    }
}

function evaluateCompleteWhenObject(rule, state, _ctx) {
    if (rule.flag) return Boolean(state[rule.flag]);
    if (rule.noLivingEnemiesWithTag) {
        const tag = rule.noLivingEnemiesWithTag;
        return !state.enemies.some((enemy) => !enemy.isDead && enemy[tag]);
    }
    if (rule.allMissionKeysSeen) {
        const mission = state.runMission;
        if (!mission?.seen || !mission.keys) return false;
        return mission.keys.every((key) => mission.seen.has(key));
    }
    return false;
}
