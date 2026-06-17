import { appendFloorSelectedInspector } from "./sandboxFloorInspector.js";
import { appendRoomNodeSelectedInspector } from "./sandboxRoomSelectedInspector.js";
import { appendForcefieldSelectedInspector, appendRoomLinkCorridorInspector, appendWallSelectedInspector } from "./sandboxWallInspector.js";
export function appendGridSelectionInspector(body, controller, selection) {
    const { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo, selectedPowerSource, selectedFloorBelt, selectedRoomNode, selectedRoomLink } = selection;
    if (appendWallSelectedInspector(body, controller, { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo })) return true;
    if (selectedForcefieldInfo) {
        appendForcefieldSelectedInspector(body, controller, selectedForcefieldInfo, { promptReselect: true });
        return true;
    }
    if (appendFloorSelectedInspector(body, controller, { selectedPowerSource, selectedFloorBelt })) return true;
    if (selectedRoomNode) {
        appendRoomNodeSelectedInspector(body, controller, selectedRoomNode);
        return true;
    }
    if (selectedRoomLink) {
        appendRoomLinkCorridorInspector(body, selectedRoomLink, controller);
        return true;
    }
    return false;
}
