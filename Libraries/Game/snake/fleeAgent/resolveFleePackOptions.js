import { getSnakeGameConfig } from "../snakeGameConfig.js";
export function resolveFleePackOptions(blackboard) {
    const cohesion = getSnakeGameConfig().fleeAgent.factionCohesion ?? {};
    const packBlend = cohesion.fleePackBlend ?? 0;
    if (packBlend <= 0) return null;
    const known = blackboard?.facts?.known;
    if (!known || (known.allyCount ?? 0) < 1) return null;
    const packAnchor = known.allyCentroid ?? (known.ally ? { x: known.ally.x, y: known.ally.y } : null);
    if (!packAnchor) return null;
    return { packAnchor, packBlend, maxPackDistCells: cohesion.maxPackDistCells ?? 16 };
}
