import { appendRoomNodeWireInspector } from "./sandboxWorldPropInspector.js";
import { appendActionRow, appendEditorHint } from "../UI/paramFields.js";
export function appendRoomNodeSelectedInspector(body, controller, selectedRoomNode) {
    appendEditorHint(
        body,
        `${selectedRoomNode.label}. Anchor (${selectedRoomNode.col}, ${selectedRoomNode.row}), size ${selectedRoomNode.width}×${selectedRoomNode.height}. Click the footprint on the map to re-select.`,
    );
    appendRoomNodeWireInspector(body, {
        listLinks: () => controller.listSelectedRoomNodeLinks(),
        removeLink: (linkId) => controller.removeRoomLinkById(linkId),
        selectedLinkId: () => controller.getSelectedRoomLinkId(),
        selectedCorridorIndex: () => controller.getSelectedRoomLinkCorridorIndex(),
        selectLink: (linkId, corridorIndex) => controller.setSelectedRoomLinkId(linkId, corridorIndex),
    });
    appendActionRow(body, [{ label: "Delete room node", onClick: () => controller.deleteSelectedRoomNode() }]);
}
