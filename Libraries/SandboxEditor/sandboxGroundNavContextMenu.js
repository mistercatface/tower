import { createContextMenu } from "../UI/contextMenu.js";
import { buildGroundNavSelectionMenuActions } from "../Sandbox/groundNav/groundNavSelectionMenu.js";
import { countNavPropsInSelection, issueGroundNavToSelection } from "../Sandbox/groundNav/input/issueGroundNavToSelection.js";
import { selectionPropIds } from "../Sandbox/sandboxSelectionInspectors.js";
export function createSandboxGroundNavContextMenu(state, session, { behaviorById, entityMeta, onIssued }) {
    const menu = createContextMenu();
    const issueGroundNav = ({ propIds, behaviorId, world }) => {
        const moved = issueGroundNavToSelection(state, { propIds, behaviorId, world, behaviorById, entityMeta: entityMeta() });
        if (moved > 0) onIssued?.();
        return moved;
    };
    return {
        close: () => menu.close(),
        isOpen: () => menu.isOpen(),
        tryOpen(clientX, clientY, world) {
            const sel = session.getSelection();
            if (sel?.kind !== "prop") return false;
            const propIds = selectionPropIds(sel);
            if (propIds.length === 0) return false;
            const navCount = countNavPropsInSelection(state, propIds, entityMeta());
            const items = buildGroundNavSelectionMenuActions({ propIds, world, navCount, issueGroundNav });
            if (items.length === 0) return false;
            menu.open(clientX, clientY, items);
            return true;
        },
    };
}
