import { ensurePoolState } from "./balls.js";
import { canBeginAim } from "./shotInput.js";
/**
 * @param {object} state
 * @returns {string}
 */
export function getPoolStatusMessage(state) {
    const pool = ensurePoolState(state);
    if (pool.won) return "You cleared the table!";
    if (pool.phase === "rolling") return "Rolling...";
    if (pool.aim?.active) return "Release to shoot";
    if (canBeginAim(state)) return "Pull back opposite your target";
    return "Wait for balls to stop";
}
