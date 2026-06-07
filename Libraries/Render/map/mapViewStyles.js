import { mapGraphNodeCoords } from "./mapViewCoords.js";
const LAYER_COLORS = ["#03A9F4", "#7E57C2", "#AB47BC", "#EC407A", "#F44336"];
const START_NODE_ID = 0;
export function gameConnectionStrokeStyle(node, targetNode, _state) {
    if (node.id === START_NODE_ID || targetNode.id === START_NODE_ID) return "rgba(255, 235, 59, 0.5)";
    return "rgba(85, 85, 85, 0.3)";
}
export function gameNodeStyle(node, state) {
    const startNode = state.getStartMapNode();
    let fillStyle = "#333";
    if (node.id === START_NODE_ID) fillStyle = "#FFEB3B";
    else if (startNode?.connections.includes(node.id)) {
        const layerIndex = Math.min(4, Math.max(0, node.layer ?? 0));
        fillStyle = LAYER_COLORS[layerIndex];
    }
    return { radius: 8, fillStyle, strokeStyle: "#FFF", lineWidth: 1.5 };
}
export const GAME_MAP_GRAPH_STYLES = {
    getNodeCoords: mapGraphNodeCoords,
    connectionLineWidth: 1.5,
    getConnectionStrokeStyle: gameConnectionStrokeStyle,
    getNodeStyle: gameNodeStyle,
    drawNodeLabel: null,
};
