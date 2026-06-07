import { worldNodeCoords } from "../../../Libraries/Render/map/mapViewCoords.js";
export function topologyConnectionStrokeStyle() {
    return "rgba(85, 85, 85, 0.4)";
}
export function topologyNodeStyle(node, _state, context) {
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
export function topologyNodeLabel(ctx, node, coords, _state, context) {
    const zoom = context.zoom ?? 1;
    if (zoom <= 0.05) return;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${20 / zoom}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(node.id), coords.x, coords.y);
}
export const TOPOLOGY_MAP_GRAPH_STYLES = {
    getNodeCoords: worldNodeCoords,
    connectionLineWidth: (context) => 4 / (context.zoom ?? 1),
    getConnectionStrokeStyle: topologyConnectionStrokeStyle,
    getNodeStyle: topologyNodeStyle,
    drawNodeLabel: topologyNodeLabel,
};
