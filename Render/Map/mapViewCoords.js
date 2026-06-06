/** Map graph space — node.x / node.y as shown in the in-game map view. */
export function mapGraphNodeCoords(_state, node) {
    return { x: node.x, y: node.y };
}

/** Scene world space — same coordinates as walls and pathfinding. */
export function worldNodeCoords(state, node) {
    return state.getNodeWorldCoords(node);
}
