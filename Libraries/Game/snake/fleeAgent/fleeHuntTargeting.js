import { getConnectedComponentPath } from "../../../Motion/kineticConstraintGraph.js";
import { getSnakeSegmentCount } from "../snakeScale.js";
export function getPreySnakeSegmentCount(state, preyHeadId) {
    return getSnakeSegmentCount(state, preyHeadId);
}
/** Nearest strikable body segment on prey snake (never the head — ram splits require body contact). */
export function resolveFleeHuntStrikeTarget(seeker, preyHeadId, state) {
    if (!seeker || preyHeadId == null) return null;
    const members = getConnectedComponentPath(state.kinetic, preyHeadId);
    if (members.length <= 1) return null;
    const lastStrikableIndex = members.length - 2;
    let best = null;
    let bestDistSq = Infinity;
    for (let i = 1; i <= lastStrikableIndex; i++) {
        const segment = state.entityRegistry.getLive(members[i]);
        if (!segment || segment.isDead) continue;
        const dx = segment.x - seeker.x;
        const dy = segment.y - seeker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            best = segment;
        }
    }
    return best;
}
