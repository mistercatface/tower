import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { createTwoAnchorWireTool } from "../Editor/twoAnchorWireTool.js";
import { addChainLink, isChainLinkBall } from "../Sandbox/chainLinks.js";
export function createChainLinkWireTool(state, session) {
    const tool = createTwoAnchorWireTool({
        getEnterCursor: () => ({ x: state.viewport.x, y: state.viewport.y }),
        pickAnchor(world) {
            const prop = findWorldPropAtInView(state.entityRegistry, state.spatialFrame, world.x, world.y);
            if (!prop || !isChainLinkBall(prop)) return null;
            return prop.id;
        },
        commitLink(fromPropId, toPropId) {
            return addChainLink(state, fromPropId, toPropId);
        },
        onAfterCommit: () => {
            session.clearSelection();
            tool.enter();
        },
        onSync: () => session.sync(),
    });
    return {
        isActive: tool.isActive,
        blocksPlacement: tool.blocksPlacement,
        getFromPropId: tool.getFromAnchorId,
        getCursor: tool.getCursor,
        enter: tool.enter,
        exit: tool.exit,
        onPointerDown: tool.onPointerDown,
        onPointerMove: tool.onPointerMove,
        enterLinkMode() {
            session.clearSelection();
            tool.enter();
        },
        startLink() {
            tool.enter();
        },
    };
}
