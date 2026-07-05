import { createWireLinkTool } from "../Editor/wireLinkTool.js";
import { addButtonLink, findButtonLinkTarget } from "../Props/props.js";
import { isButtonEntity } from "../Props/props.js";
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
    });
    return {
        isActive: tool.isActive,
        blocksPlacement: tool.blocksPlacement,
        enter: tool.enter,
        exit: tool.exit,
        onPointerDown: tool.onPointerDown,
        onPointerMove: tool.onPointerMove,
        getCursor: tool.getCursor,
        startLink() {
            if (!isButtonEntity(session.getSelectedProp())) return;
            tool.enter();
        },
    };
}
