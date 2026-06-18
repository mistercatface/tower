import { createWireLinkTool } from "../Editor/wireLinkTool.js";
import { addButtonLink, appendButtonWirePreviewCommands, findButtonLinkTarget } from "../Sandbox/buttonLinks.js";
import { isButtonEntity } from "../Sandbox/buttonInput.js";
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
        appendWire(out, cursor) {
            appendButtonWirePreviewCommands(out, state, session.getSelectedProp()?.id ?? null, cursor);
        },
    });
    return {
        isActive: tool.isActive,
        blocksPlacement: tool.blocksPlacement,
        enter: tool.enter,
        exit: tool.exit,
        onPointerDown: tool.onPointerDown,
        onPointerMove: tool.onPointerMove,
        appendOverlayCommands: tool.appendOverlayCommands,
        getCursor: tool.getCursor,
        startLink() {
            if (!isButtonEntity(session.getSelectedProp())) return;
            tool.enter();
        },
    };
}
