import { ensurePoolState } from "./balls.js";
import { POOL_CUE_MIN_PULL_DRAG } from "./config/tableLayout.js";
import { canBeginAim, getAimPreview } from "./shotInput.js";
/**
 * @param {object} state
 * @returns {string}
 */
export function getPoolStatusMessage(state) {
    const pool = ensurePoolState(state);
    if (pool.won) return "You cleared the table!";
    if (pool.phase === "rolling") return "Rolling...";
    if (pool.aim?.active) {
        const preview = getAimPreview(state);
        if (preview && preview.currentDrag >= POOL_CUE_MIN_PULL_DRAG) return "Release to shoot";
        return "Pull back from where you pressed";
    }
    if (canBeginAim(state)) return "Press, pull back, release to shoot";
    return "Wait for balls to stop";
}
