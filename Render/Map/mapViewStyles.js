import { combatNodeCoords, mapGraphNodeCoords } from "./mapViewCoords.js";

const LAYER_COLORS = ["#03A9F4", "#7E57C2", "#AB47BC", "#EC407A", "#F44336"];

const START_NODE_ID = 0;

export function gameConnectionStrokeStyle(node, targetNode, _state) {
    if (node.id === START_NODE_ID || targetNode.id === START_NODE_ID) {
        return "rgba(255, 235, 59, 0.5)";
    }
    return "rgba(85, 85, 85, 0.3)";
}

export function gameNodeStyle(node, state) {
    const startNode = state.getStartMapNode();
    let fillStyle = "#333";

    if (node.id === START_NODE_ID) {
        fillStyle = "#FFEB3B";
    } else if (startNode && startNode.connections.includes(node.id)) {
        const layerIndex = Math.min(4, Math.max(0, node.layer ?? 0));
        fillStyle = LAYER_COLORS[layerIndex];
    }

    return {
        radius: 8,
        fillStyle,
        strokeStyle: "#FFF",
        lineWidth: 1.5,
    };
}

export function labConnectionStrokeStyle() {
    return "rgba(85, 85, 85, 0.4)";
}

export function labNodeStyle(node, _state, context) {
    const zoom = context.zoom ?? 1;
    const selectedNodeId = context.selectedNodeId ?? null;
    const theme = node.wallTheme;

    return {
        radius: 30 / zoom,
        fillStyle: theme ? `rgb(${theme.r}, ${theme.g}, ${theme.b})` : "#555",
        strokeStyle: node.id === selectedNodeId ? "#fff" : "rgba(255, 255, 255, 0.5)",
        lineWidth: node.id === selectedNodeId ? 8 / zoom : 3 / zoom,
    };
}

export function labNodeLabel(ctx, node, coords, _state, context) {
    const zoom = context.zoom ?? 1;
    if (zoom <= 0.05) return;

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${20 / zoom}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.id.toString(), coords.x, coords.y);
}

export const GAME_MAP_GRAPH_STYLES = {
    getNodeCoords: mapGraphNodeCoords,
    connectionLineWidth: 1.5,
    getConnectionStrokeStyle: gameConnectionStrokeStyle,
    getNodeStyle: gameNodeStyle,
    drawNodeLabel: null,
};

export const LAB_MAP_GRAPH_STYLES = {
    getNodeCoords: combatNodeCoords,
    connectionLineWidth: (context) => 4 / (context.zoom ?? 1),
    getConnectionStrokeStyle: labConnectionStrokeStyle,
    getNodeStyle: labNodeStyle,
    drawNodeLabel: labNodeLabel,
};
