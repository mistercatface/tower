import { drawMapWallCache, getGameMapWallCache, getLabMapWallCache } from "./MapWallCache.js";
import { GAME_MAP_GRAPH_STYLES, LAB_MAP_GRAPH_STYLES } from "./mapViewStyles.js";

function resolveLineWidth(styles, context) {
    const width = styles.connectionLineWidth;
    return typeof width === "function" ? width(context) : width;
}

export function drawMapConnections(ctx, state, styles, context = {}) {
    const lineWidth = resolveLineWidth(styles, context);

    for (const node of state.mapNodes) {
        const coordsA = styles.getNodeCoords(state, node);
        for (const connId of node.connections) {
            const targetNode = state.getMapNode(connId);
            if (!targetNode) continue;
            const coordsB = styles.getNodeCoords(state, targetNode);

            ctx.beginPath();
            ctx.moveTo(coordsA.x, coordsA.y);
            ctx.lineTo(coordsB.x, coordsB.y);
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = styles.getConnectionStrokeStyle(node, targetNode, state, context);
            ctx.stroke();
        }
    }
}

export function drawMapNodes(ctx, state, styles, context = {}) {
    for (const node of state.mapNodes) {
        const coords = styles.getNodeCoords(state, node);
        const nodeStyle = styles.getNodeStyle(node, state, context);

        ctx.beginPath();
        ctx.arc(coords.x, coords.y, nodeStyle.radius, 0, Math.PI * 2);
        ctx.fillStyle = nodeStyle.fillStyle;
        ctx.fill();
        ctx.lineWidth = nodeStyle.lineWidth;
        ctx.strokeStyle = nodeStyle.strokeStyle;
        ctx.stroke();

        if (styles.drawNodeLabel) {
            styles.drawNodeLabel(ctx, node, coords, state, context);
        }
    }
}

export function drawMapGraph(ctx, state, styles = GAME_MAP_GRAPH_STYLES, context = {}) {
    drawMapConnections(ctx, state, styles, context);
    drawMapNodes(ctx, state, styles, context);
}

export function drawGameMapLayers(ctx, state) {
    drawMapWallCache(ctx, getGameMapWallCache(state));
    drawMapGraph(ctx, state, GAME_MAP_GRAPH_STYLES);
}

export function drawLabMapWallLayer(ctx, state) {
    drawMapWallCache(ctx, getLabMapWallCache(state));
}

export function drawLabMapGraph(ctx, state, context = {}) {
    drawMapGraph(ctx, state, LAB_MAP_GRAPH_STYLES, context);
}
