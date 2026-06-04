/** Map graph space — node.x / node.y as shown in the in-game map view. */
export function mapGraphNodeCoords(_state, node) {
    return { x: node.x, y: node.y };
}

/** Combat world space — same coordinates as walls and pathfinding. */
export function combatNodeCoords(state, node) {
    return state.getNodeCombatCoords(node);
}
