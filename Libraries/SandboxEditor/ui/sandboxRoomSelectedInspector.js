import { appendRoomNodeWireInspector } from "./sandboxWorldPropInspector.js";
import { appendRailWallHeightSlider, appendRailWallThicknessSlider } from "./sandboxWallInspector.js";
import { resolveRailWallHeightLevel, resolveRailWallThicknessLevel } from "../../RoomGraph/roomGraphClosedRooms.js";
import { appendSurfaceProfileField } from "../../RoomGraph/roomGraphSurfaceProfile.js";
import { appendActionRow, appendEditorHint } from "../../UI/paramFields.js";
export function appendRoomNodeSelectedInspector(body, state, controller, selectedRoomNode) {
    appendEditorHint(
        body,
        `${selectedRoomNode.label}. Anchor (${selectedRoomNode.col}, ${selectedRoomNode.row}), size ${selectedRoomNode.width}×${selectedRoomNode.height}. Click the footprint on the map to re-select.`,
    );
    appendRailWallHeightSlider(body, state, resolveRailWallHeightLevel(selectedRoomNode.railWallHeightLevel), (val) => {
        controller.updateSelectedRoomNode({ railWallHeightLevel: val });
    });
    appendRailWallThicknessSlider(body, controller, resolveRailWallThicknessLevel(selectedRoomNode.railWallThicknessLevel), (val) => {
        controller.updateSelectedRoomNode({ railWallThicknessLevel: val });
    });
    appendSurfaceProfileField(body, "Floor profile", selectedRoomNode.surfaceProfileId, (profileId) => {
        controller.updateSelectedRoomNode({ surfaceProfileId: profileId });
    });
    appendRoomNodeWireInspector(body, {
        listLinks: () => controller.listSelectedRoomNodeLinks(),
        removeLink: (linkId) => controller.removeRoomLinkById(linkId),
        selectedLinkId: () => {
            const sel = controller.getSelection();
            return sel?.kind === "roomLink" ? sel.linkId : null;
        },
        selectedCorridorIndex: () => {
            const sel = controller.getSelection();
            return sel?.kind === "roomLink" ? sel.corridorIndex : 0;
        },
        selectLink: (linkId, corridorIndex) => controller.select({ kind: "roomLink", linkId, corridorIndex, nodeId: selectedRoomNode.id }),
    });
    appendActionRow(body, [{ label: "Delete room node", onClick: () => controller.deleteSelectedRoomNode() }]);
}
