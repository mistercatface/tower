import { drawMapWallCache } from "./MapWallCache.js";
import { drawMapPathDebugCache } from "./MapPathDebugCache.js";
import { GAME_MAP_GRAPH_STYLES } from "./mapViewStyles.js";
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
        if (styles.drawNodeLabel) styles.drawNodeLabel(ctx, node, coords, state, context);
    }
}
function drawMapGraph(ctx, state, styles, context = {}) {
    drawMapConnections(ctx, state, styles, context);
    drawMapNodes(ctx, state, styles, context);
}
function renderMapViewContent(ctx, state, config) {
    const { showWalls = true, showGraph = true, showPathDebug = false, graphContext = {}, graphStyles = GAME_MAP_GRAPH_STYLES, wallCache = null } = config;
    if (showPathDebug) drawMapPathDebugCache(ctx, state.mapPathDebugCache);
    if (showWalls && wallCache) drawMapWallCache(ctx, wallCache);
    if (showGraph) drawMapGraph(ctx, state, graphStyles, graphContext);
}
/** Map graph + debug layers in an already world-transformed context (no clear, no viewport.apply). */
export function drawMapViewInWorld(ctx, state, config) {
    renderMapViewContent(ctx, state, config);
    if (config.drawOverlays) config.drawOverlays(ctx, state, config);
}
export function renderMapView(ctx, state, config) {
    const { width, height, viewport, backgroundColor = "#080a0e", clearBackground = true, drawOverlays } = config;
    ctx.save();
    if (clearBackground && width > 0 && height > 0) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }
    if (viewport) {
        if (width > 0 && height > 0) viewport.setCanvasSize(width, height);
        viewport.apply(ctx);
    }
    renderMapViewContent(ctx, state, config);
    if (drawOverlays) drawOverlays(ctx, state, config);
    ctx.restore();
}
