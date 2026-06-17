import { createTwoAnchorWireTool } from "../Editor/twoAnchorWireTool.js";
import { pickRoomNodeAt } from "../RoomGraph/index.js";
export function createCorridorLinkWireTool(state, session) {
    const tool = createTwoAnchorWireTool({
        getEnterCursor: () => ({ x: state.viewport.x, y: state.viewport.y }),
        pickAnchor(world) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(world.x, world.y);
            return pickRoomNodeAt(state, col, row)?.id ?? null;
        },
        commitLink(fromNodeId, toNodeId) {
            const width = session.getSpawnCorridorWidth();
            return session.addRoomLinkBetweenNodes(fromNodeId, toNodeId, {
                corridorType: session.getSpawnCorridorType(),
                corridorWidthMin: width,
                corridorWidthMax: width,
                surfaceProfileId: session.getSpawnCorridorSurfaceProfileId(),
            });
        },
        onAfterCommit: () => {
            session.clearPropSelection();
            session.clearRoomGraphSelection();
            tool.enter();
        },
        onSync: () => session.sync(),
    });
    return {
        isActive: tool.isActive,
        blocksPlacement: tool.blocksPlacement,
        getFromNodeId: tool.getFromAnchorId,
        getCursor: tool.getCursor,
        enter: tool.enter,
        exit: tool.exit,
        onPointerDown: tool.onPointerDown,
        onPointerMove: tool.onPointerMove,
        enterLinkMode() {
            session.clearPropSelection();
            session.clearRoomGraphSelection();
            tool.enter();
        },
    };
}
