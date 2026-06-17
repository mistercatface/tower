import { appendFloorSelectedInspector } from "./sandboxFloorInspector.js";
import { appendRoomNodeSelectedInspector } from "./sandboxRoomSelectedInspector.js";
import { appendForcefieldSelectedInspector, appendRoomLinkCorridorInspector, appendWallSelectedInspector } from "./sandboxWallInspector.js";
export function appendGridSelectionInspector(body, state, controller, selection) {
    const { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo, selectedPowerSource, selectedFloorBelt, selectedRoomNode, selectedRoomLink } = selection;
    if (appendWallSelectedInspector(body, state, controller, { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo })) return true;
    if (selectedForcefieldInfo) {
        appendForcefieldSelectedInspector(body, controller, selectedForcefieldInfo, { promptReselect: true });
        return true;
    }
    if (appendFloorSelectedInspector(body, controller, { selectedPowerSource, selectedFloorBelt })) return true;
    if (selectedRoomNode) {
        appendRoomNodeSelectedInspector(body, state, controller, selectedRoomNode);
        return true;
    }
    if (selectedRoomLink) {
        appendRoomLinkCorridorInspector(body, state, selectedRoomLink, controller);
        return true;
    }
    return false;
}
