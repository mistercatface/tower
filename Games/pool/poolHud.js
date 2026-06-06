import { ensurePoolState } from "./balls.js";
import { POOL_CUE_STICK_TUNING } from "./config/cueStick.js";
import { canBeginAim, getAimPreview } from "./shotInput.js";
const { minPullDrag } = POOL_CUE_STICK_TUNING;
/**
 * @param {object} state
 * @returns {string}
 */
export function getPoolStatusMessage(state) {
    const pool = ensurePoolState(state);
    if (pool.won) return "You cleared the table!";
    if (pool.phase === "rolling") return "Rolling...";
    if (pool.phase === "striking") return "";
    if (pool.aim?.active) {
        const preview = getAimPreview(state);
        if (preview && preview.currentDrag >= minPullDrag) return "Release to shoot";
        return "Pull back from where you pressed";
    }
    if (canBeginAim(state)) return "Press, pull back, release to shoot";
    return "Wait for balls to stop";
}
