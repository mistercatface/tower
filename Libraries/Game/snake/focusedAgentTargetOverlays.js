import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { overlayCircleFillStroke } from "../../Render/overlays/overlayCommands.js";
function focusedTargetRingStyle(config) {
    const style = config.focusedAgentDebug?.targetRing ?? {};
    return { fill: style.fill ?? "rgba(255, 60, 60, 0.22)", stroke: style.stroke ?? "rgba(255, 80, 80, 0.9)", entityPad: style.entityPad ?? 2, cellScale: style.cellScale ?? 0.38 };
}
export function resolveCommittedTargetWorld(state, intentTarget) {
    if (!intentTarget) return null;
    const { targetId, destination } = intentTarget;
    const grid = state.obstacleGrid;
    if (targetId != null) {
        const prop = state.entityRegistry.getLive(targetId);
        if (prop && !prop.isDead) return { x: prop.x, y: prop.y, radius: prop.radius ?? 3, kind: "entity" };
    }
    const world = destination?.world ?? destination?.routeWorld ?? destination?.terminalWorld;
    if (world) return { x: world.x, y: world.y, radius: grid.cellSize * 0.5, kind: "cell" };
    if (destination?.col != null && destination?.row != null) {
        const bounds = grid.getCellBounds(destination.col, destination.row);
        return { x: (bounds.minX + bounds.maxX) * 0.5, y: (bounds.minY + bounds.maxY) * 0.5, radius: grid.cellSize * 0.5, kind: "cell" };
    }
    return null;
}
function readIntentTarget(instance) {
    const intent = instance?.intent;
    if (!intent) return null;
    return { mode: intent.getMode?.() ?? null, targetId: intent.getTargetId?.() ?? null, destination: intent.getDestination?.() ?? null };
}
export function appendFocusedAgentTargetOverlayCommands(out, state, session, config = getSnakeGameConfig()) {
    const prop = state.followCamera?.targetProp;
    if (!prop) return;
    const instance = session.instancesByHeadId.get(prop.id);
    const target = resolveCommittedTargetWorld(state, readIntentTarget(instance));
    if (!target) return;
    const style = focusedTargetRingStyle(config);
    const radius = target.kind === "entity" ? target.radius + style.entityPad : target.radius * style.cellScale;
    out.push(overlayCircleFillStroke(target.x, target.y, radius, { fill: style.fill, stroke: style.stroke, lineWidth: 1.5 }));
}
