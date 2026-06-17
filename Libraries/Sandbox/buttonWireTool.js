import { createWireLinkTool } from "../Editor/wireLinkTool.js";
import { addButtonLink, drawButtonWirePreview, findButtonLinkTarget } from "./buttonLinks.js";
import { isButtonEntity } from "./buttonInput.js";
export function createButtonWireTool(state, session) {
    const tool = createWireLinkTool({
        getEnterCursor: () => ({ x: state.viewport.x, y: state.viewport.y }),
        onLinkClick(world) {
            const button = session.getSelectedProp();
            if (!isButtonEntity(button)) return;
            const target = findButtonLinkTarget(state, world.x, world.y, button.id);
            if (target) addButtonLink(state, button.id, target);
        },
        onSync: () => session.sync(),
        drawWire(ctx, cursor) {
            drawButtonWirePreview(ctx, state, session.getSelectedPropId(), cursor);
        },
    });
    return {
        isActive: tool.isActive,
        blocksPlacement: tool.blocksPlacement,
        enter: tool.enter,
        exit: tool.exit,
        onPointerDown: tool.onPointerDown,
        onPointerMove: tool.onPointerMove,
        drawOverlay: tool.drawOverlay,
        getCursor: tool.getCursor,
        startLink() {
            if (!isButtonEntity(session.getSelectedProp())) return;
            tool.enter();
        },
    };
}
