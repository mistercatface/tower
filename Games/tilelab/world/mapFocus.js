import { gridSettings } from "../../../Config/Config.js";
import { getWorldGen } from "../../../Core/GamePorts.js";

export function getLabFocus(state) {
    return state._labFocus ?? { x: 0, y: 0 };
}

export function setLabFocus(state, x, y) {
    state._labFocus = { x, y };
}

export function focusLabNode(state, nodeId) {
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) return getLabFocus(state);
    const worldCoords = state.getNodeWorldCoords(node);
    const startNodeId = getWorldGen().startMapNodeId ?? 0;
    if (nodeId === startNodeId) {
        const layout = getWorldGen().getStartLayout(worldCoords.x, worldCoords.y, gridSettings.cellSize);
        setLabFocus(state, layout.spawnX, layout.spawnY);
    } else setLabFocus(state, worldCoords.x, worldCoords.y);
    return getLabFocus(state);
}
