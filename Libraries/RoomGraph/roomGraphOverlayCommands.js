import { appendOverlayWireLink, overlayAabb } from "../Render/overlays/overlayCommands.js";
import { createAabb, emptyAabbInto, growAabbFromCenterInto } from "../Math/Aabb2D.js";
import { listRoomLinks, listRoomNodes, roomNodeCenterWorld } from "./roomGraphStore.js";
const NODE_OUTLINE_BOUNDS = createAabb();
export function appendRoomGraphOverlayCommands(
    out,
    state,
    grid,
    { selectedNodeId = null, selectedLinkId = null, wireFromNodeId = null, wireCursor = null, showRoomNodesAlways = false, wireModeActive = false } = {},
) {
    if (!showRoomNodesAlways && !wireModeActive) return;
    const nodes = listRoomNodes(state);
    if (!nodes.length) return;
    const links = listRoomLinks(state);
    const half = grid.cellHalfSize;
    if (showRoomNodesAlways)
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const nodeA = nodes.find((node) => node.id === link.a);
            const nodeB = nodes.find((node) => node.id === link.b);
            if (!nodeA || !nodeB) continue;
            const a = roomNodeCenterWorld(grid, nodeA);
            const b = roomNodeCenterWorld(grid, nodeB);
            appendOverlayWireLink(out, a.x, a.y, b.x, b.y, link.id === selectedLinkId ? "#64B5F6" : "#5C9FD6");
        }
    if (wireFromNodeId != null && wireCursor) {
        const fromNode = nodes.find((node) => node.id === wireFromNodeId);
        if (fromNode) {
            const from = roomNodeCenterWorld(grid, fromNode);
            appendOverlayWireLink(out, from.x, from.y, wireCursor.x, wireCursor.y, "#FFB74D");
        }
    }
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const selected = node.id === selectedNodeId;
        const c0 = grid.gridToWorld(node.col, node.row);
        const c1 = grid.gridToWorld(node.col + node.width - 1, node.row + node.height - 1);
        const bounds = emptyAabbInto(NODE_OUTLINE_BOUNDS);
        growAabbFromCenterInto(bounds, c0.x, c0.y, half, half);
        growAabbFromCenterInto(bounds, c1.x, c1.y, half, half);
        out.push(
            overlayAabb(bounds, {
                fill: selected ? "rgba(120, 180, 255, 0.16)" : wireModeActive ? "rgba(120, 180, 255, 0.12)" : "rgba(120, 180, 255, 0.08)",
                stroke: selected ? "rgba(120, 180, 255, 0.95)" : wireModeActive ? "rgba(120, 180, 255, 0.75)" : "rgba(120, 180, 255, 0.55)",
                lineWidth: 1,
                dash: [6, 4],
            }),
        );
    }
}
